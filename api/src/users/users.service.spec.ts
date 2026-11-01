import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { RefreshTokenService } from '../auth/refresh-token.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const admin: AuthUser = { id: 'admin-1', organisationId: 'org-A', role: 'ADMIN' };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-2',
    email: 'maria@acme.test',
    fullName: 'Maria Agent',
    role: 'AGENT',
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const refreshTokens = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    refreshTokens as unknown as RefreshTokenService,
  );
  return { service, prisma, refreshTokens };
}

describe('UsersService tenant isolation', () => {
  it('lists only users from the actor organisation', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([makeUser()]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.list(admin, { page: 1, pageSize: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: 'org-A' } }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { organisationId: 'org-A' },
    });
    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it('never selects the password hash', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.list(admin, { page: 1, pageSize: 20 });

    const args = prisma.user.findMany.mock.calls[0]?.[0] as {
      select: Record<string, boolean>;
    };
    expect(args.select).not.toHaveProperty('passwordHash');
  });

  it('creates users in the actor organisation with a hashed password', async () => {
    const { service, prisma } = setup();
    prisma.user.create.mockResolvedValue(makeUser());

    await service.create(admin, {
      fullName: 'Maria Agent',
      email: 'maria@acme.test',
      password: 'AgentPassword123',
      role: 'AGENT',
    });

    const args = prisma.user.create.mock.calls[0]?.[0] as {
      data: { organisationId: string; passwordHash: string; role: string };
    };
    expect(args.data.organisationId).toBe('org-A');
    expect(args.data.role).toBe('AGENT');
    expect(args.data.passwordHash).not.toBe('AgentPassword123');
  });

  it('rejects a duplicate email', async () => {
    const { service, prisma } = setup();
    prisma.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(admin, {
        fullName: 'Maria Agent',
        email: 'maria@acme.test',
        password: 'AgentPassword123',
        role: 'AGENT',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns 404 for another organisation's user", async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.update(admin, 'user-from-org-B', { fullName: 'Hacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-from-org-B', organisationId: 'org-A' },
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to edit an admin account', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(makeUser({ role: 'ADMIN' }));

    await expect(
      service.update(admin, 'user-2', { role: 'CUSTOMER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes updates with the organisation filter too', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(makeUser());
    prisma.user.update.mockResolvedValue(makeUser({ fullName: 'Maria S.' }));

    await service.update(admin, 'user-2', { fullName: 'Maria S.' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-2', organisationId: 'org-A' },
      }),
    );
  });

  it('does not let an admin deactivate their own account', async () => {
    const { service } = setup();

    await expect(service.deactivate(admin, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deactivates a user and ends their sessions', async () => {
    const { service, prisma, refreshTokens } = setup();
    prisma.user.findFirst.mockResolvedValue(makeUser());
    prisma.user.update.mockResolvedValue(makeUser({ isActive: false }));

    const result = await service.deactivate(admin, 'user-2');

    expect(result.isActive).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-2', organisationId: 'org-A' },
        data: { isActive: false },
      }),
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-2');
  });

  it("does not touch another organisation's user on deactivate", async () => {
    const { service, prisma, refreshTokens } = setup();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.deactivate(admin, 'user-from-org-B'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});