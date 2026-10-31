import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const jwt = new JwtService({
  secret: 'test-secret-test-secret-test-secret-1234',
  signOptions: { expiresIn: 900 },
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    organisationId: 'org-1',
    email: 'alex@acme.test',
    fullName: 'Alex Admin',
    role: 'ADMIN',
    isActive: true,
    passwordHash: 'unused',
    ...overrides,
  };
}

function setup() {
  const tx = {
    organisation: {
      create: vi.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }),
    },
    user: {
      create: vi
        .fn()
        .mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
          makeUser({ ...data, id: 'user-1' }),
        ),
    },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new AuthService(prisma as unknown as PrismaService, jwt);
  return { service, prisma, tx };
}

const registerDto = {
  organisationName: 'Acme',
  fullName: 'Alex Admin',
  email: 'alex@acme.test',
  password: 'CorrectHorse123',
};

describe('AuthService', () => {
  describe('registerOrganisation', () => {
    it('creates an organisation and its first admin, and returns a token', async () => {
      const { service, prisma, tx } = setup();
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.registerOrganisation(registerDto);

      expect(tx.organisation.create).toHaveBeenCalledWith({
        data: { name: 'Acme' },
      });
      const created = tx.user.create.mock.calls[0]?.[0] as {
        data: { passwordHash: string; role: string };
      };
      expect(created.data.role).toBe('ADMIN');
      expect(created.data.passwordHash).not.toBe('CorrectHorse123');
      expect(
        await bcrypt.compare('CorrectHorse123', created.data.passwordHash),
      ).toBe(true);

      const payload = await jwt.verifyAsync(result.accessToken);
      expect(payload).toMatchObject({ sub: 'user-1', org: 'org-1', role: 'ADMIN' });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an email that is already registered', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.registerOrganisation(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token for the correct password', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('CorrectHorse123', 4);
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));

      const result = await service.login({
        email: 'alex@acme.test',
        password: 'CorrectHorse123',
      });

      expect(result.user.email).toBe('alex@acme.test');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('CorrectHorse123', 4);
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));

      await expect(
        service.login({ email: 'alex@acme.test', password: 'WrongPassword1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@acme.test', password: 'CorrectHorse123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated user even with the right password', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('CorrectHorse123', 4);
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash, isActive: false }),
      );

      await expect(
        service.login({ email: 'alex@acme.test', password: 'CorrectHorse123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});