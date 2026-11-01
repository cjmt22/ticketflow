import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function setup() {
  const refreshToken = {
    create: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    refreshToken,
    $transaction: vi.fn(
      async (fn: (tx: { refreshToken: typeof refreshToken }) => unknown) =>
        fn({ refreshToken }),
    ),
  };
  const service = new RefreshTokenService(prisma as unknown as PrismaService);
  return { service, refreshToken };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'unused',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

describe('RefreshTokenService', () => {
  it('stores only a hash of the issued token', async () => {
    const { service, refreshToken } = setup();

    const token = await service.issue('user-1');

    const args = refreshToken.create.mock.calls[0]?.[0] as {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    };
    expect(args.data.tokenHash).toBe(sha256(token));
    expect(args.data.tokenHash).not.toBe(token);
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rotates a valid token: revokes the old one and issues a new one', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(record());

    const result = await service.rotate('presented-token');

    expect(refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('presented-token') },
    });
    expect(result.userId).toBe('user-1');
    expect(result.refreshToken).not.toBe('presented-token');
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown token', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.rotate('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('treats reuse of a revoked token as theft and revokes all sessions', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(
      record({ revokedAt: new Date() }),
    );

    await expect(service.rotate('old-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(
      record({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.rotate('expired')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when another request used the token at the same moment', async () => {
    const { service, refreshToken } = setup();
    refreshToken.findUnique.mockResolvedValue(record());
    refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate('racing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes a token by its hash on logout', async () => {
    const { service, refreshToken } = setup();

    await service.revoke('some-token');

    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('some-token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});