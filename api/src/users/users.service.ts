import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../auth/auth.constants.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateUserDto,
  ListUsersQuery,
  UpdateUserDto,
} from './users.schemas.js';

// Never select passwordHash: it must not leave the database layer.
const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenService)
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async list(actor: AuthUser, query: ListUsersQuery) {
    const where = { organisationId: actor.organisationId };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, page: query.page, pageSize: query.pageSize, total };
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: {
          organisationId: actor.organisationId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.findInOrganisation(actor, id);
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin accounts cannot be changed here');
    }
    return this.prisma.user.update({
      where: { id: target.id, organisationId: actor.organisationId },
      data: { fullName: dto.fullName, role: dto.role },
      select: USER_SELECT,
    });
  }

  async deactivate(actor: AuthUser, id: string) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const target = await this.findInOrganisation(actor, id);
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin accounts cannot be deactivated here');
    }
    const user = await this.prisma.user.update({
      where: { id: target.id, organisationId: actor.organisationId },
      data: { isActive: false },
      select: USER_SELECT,
    });
    // End their sessions straight away, not when the access token expires.
    await this.refreshTokens.revokeAllForUser(target.id);
    return user;
  }

  // Another company's user looks exactly like a user that doesn't exist.
  private async findInOrganisation(actor: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organisationId: actor.organisationId },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}