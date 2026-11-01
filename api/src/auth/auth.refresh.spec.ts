import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

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
  const prisma = { user: { findUnique: vi.fn() } };
  const refreshTokens = {
    issue: vi.fn(),
    rotate: vi
      .fn()
      .mockResolvedValue({ userId: 'user-1', refreshToken: 'new-refresh-token' }),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    refreshTokens as unknown as RefreshTokenService,
  );
  return { service, prisma, refreshTokens };
}

describe('AuthService refresh and logout', () => {
  it('rotates the refresh token and returns a new access token', async () => {
    const { service, prisma, refreshTokens } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const session = await service.refresh('old-refresh-token');

    expect(refreshTokens.rotate).toHaveBeenCalledWith('old-refresh-token');
    expect(session.refreshToken).toBe('new-refresh-token');
    const payload = await jwt.verifyAsync(session.accessToken);
    expect(payload).toMatchObject({ sub: 'user-1', org: 'org-1', role: 'ADMIN' });
  });

  it('revokes every session and rejects when the user is deactivated', async () => {
    const { service, prisma, refreshTokens } = setup();
    prisma.user.findUnique.mockResolvedValue(makeUser({ isActive: false }));

    await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('revokes the presented token on logout', async () => {
    const { service, refreshTokens } = setup();

    await service.logout('some-token');

    expect(refreshTokens.revoke).toHaveBeenCalledWith('some-token');
  });

  it('does nothing on logout when there is no token', async () => {
    const { service, refreshTokens } = setup();

    await service.logout(undefined);

    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});