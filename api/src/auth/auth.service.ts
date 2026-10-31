import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto, RegisterOrganisationDto } from './auth.schemas.js';
import type {
  AccessTokenPayload,
  AuthResult,
  PublicUser,
  UserRole,
} from './auth.types.js';

const BCRYPT_ROUNDS = 12;

// When an email doesn't exist we still run a password comparison, so the
// response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  return dummyHash;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

interface UserRecord {
  id: string;
  organisationId: string;
  email: string;
  fullName: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async registerOrganisation(dto: RegisterOrganisationDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const organisation = await tx.organisation.create({
          data: { name: dto.organisationName },
        });
        return tx.user.create({
          data: {
            organisationId: organisation.id,
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            role: 'ADMIN',
          },
        });
      });
      return await this.buildResult(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildResult(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organisation: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or deactivated');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organisationId: user.organisationId,
      organisationName: user.organisation.name,
    };
  }

  private async buildResult(user: UserRecord): Promise<AuthResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      org: user.organisationId,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organisationId: user.organisationId,
    };
    return { accessToken, user: publicUser };
  }
}