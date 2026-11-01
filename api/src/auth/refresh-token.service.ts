import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants.js';

// Tokens are long random strings, so a fast hash is fine (unlike passwords).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class RefreshTokenService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Creates a refresh token for a user. Returns the raw token; only its hash is stored. */
  async issue(userId: string): Promise<string> {
    const token = newToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return token;
  }

  /** Swaps a valid refresh token for a new one. The old one can never be used again. */
  async rotate(
    presented: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      // An already-used token came back: assume it was stolen, end every session.
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const next = newToken();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count !== 1) {
        // Another request used this token at the same moment.
        throw new UnauthorizedException('Invalid refresh token');
      }
      await tx.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: hashToken(next),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    });

    return { userId: record.userId, refreshToken: next };
  }

  async revoke(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}