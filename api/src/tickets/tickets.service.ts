import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canTransition, type TicketStatus } from './ticket-status.js';
import { scopeFor } from './ticket-scope.js';
import type {
  CreateTicketDto,
  ListTicketsQuery,
  UpdateTicketDto,
} from './tickets.schemas.js';

const TICKET_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  category: true,
  aiCategory: true,
  aiPriority: true,
  aiSentiment: true,
  aiSummary: true,
  requesterId: true,
  assigneeId: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, fullName: true } },
  assignee: { select: { id: true, fullName: true } },
} as const;

function orderByFor(sort: ListTicketsQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
    case 'updated':
      return [{ updatedAt: 'desc' as const }, { id: 'asc' as const }];
    default:
      return [{ createdAt: 'desc' as const }, { id: 'asc' as const }];
  }
}

export interface AiFields {
  aiCategory: string | null;
  aiPriority: string | null;
  aiSentiment: string | null;
  aiSummary: string | null;
}

// The AI fields are aids for agents, so customers never see them.
function present<T extends AiFields>(
  actor: AuthUser,
  ticket: T,
): T | Omit<T, keyof AiFields> {
  if (actor.role !== 'CUSTOMER') return ticket;
  const { aiCategory, aiPriority, aiSentiment, aiSummary, ...visible } = ticket;
  void [aiCategory, aiPriority, aiSentiment, aiSummary];
  return visible;
}

@Injectable()
export class TicketsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateTicketDto) {
    const ticket = await this.prisma.ticket.create({
      data: {
        organisationId: actor.organisationId,
        requesterId: actor.id,
        title: dto.title,
        description: dto.description,
      },
      select: TICKET_SELECT,
    });
    return present(actor, ticket);
  }

  async list(actor: AuthUser, query: ListTicketsQuery) {
    const where = {
      ...scopeFor(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.q
        ? {
            OR: [
              {
                title: { contains: query.q, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: TICKET_SELECT,
        orderBy: orderByFor(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets.map((ticket) => present(actor, ticket)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actor: AuthUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...scopeFor(actor) },
      select: TICKET_SELECT,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return present(actor, ticket);
  }

  async update(actor: AuthUser, id: string, dto: UpdateTicketDto) {
    await this.findScoped(actor, id);
    await this.prisma.ticket.updateMany({
      where: { id, organisationId: actor.organisationId },
      data: { category: dto.category, priority: dto.priority },
    });
    return this.get(actor, id);
  }

  async changeStatus(actor: AuthUser, id: string, next: TicketStatus) {
    const ticket = await this.findScoped(actor, id);

    if (actor.role === 'CUSTOMER' && next !== 'OPEN') {
      throw new ForbiddenException('Customers can only reopen their own tickets');
    }
    if (!canTransition(ticket.status, next)) {
      throw new BadRequestException(
        `A ticket cannot move from ${ticket.status} to ${next}`,
      );
    }

    const changed = await this.prisma.$transaction(async (tx) => {
      // The status filter makes sure nobody changed it since we read it.
      const { count } = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          organisationId: actor.organisationId,
          status: ticket.status,
        },
        data: { status: next },
      });
      if (count !== 1) return false;
      await tx.auditLog.create({
        data: {
          organisationId: actor.organisationId,
          actorId: actor.id,
          action: `TICKET_STATUS_CHANGED ${ticket.status}->${next}`,
          entityType: 'TICKET',
          entityId: ticket.id,
        },
      });
      return true;
    });

    if (!changed) {
      throw new ConflictException(
        'This ticket was just changed by someone else. Refresh and try again.',
      );
    }
    return this.get(actor, id);
  }

  async assign(actor: AuthUser, id: string, assigneeId: string | null) {
    const ticket = await this.findScoped(actor, id);

    if (assigneeId) {
      // Same message whether the person is missing or in another company.
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: assigneeId,
          organisationId: actor.organisationId,
          isActive: true,
          role: { in: ['AGENT', 'ADMIN'] },
        },
        select: { id: true },
      });
      if (!assignee) {
        throw new BadRequestException(
          'Assignee must be an active agent or admin in your organisation',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { id: ticket.id, organisationId: actor.organisationId },
        data: { assigneeId },
      });
      await tx.auditLog.create({
        data: {
          organisationId: actor.organisationId,
          actorId: actor.id,
          action: assigneeId ? 'TICKET_ASSIGNED' : 'TICKET_UNASSIGNED',
          entityType: 'TICKET',
          entityId: ticket.id,
        },
      });
    });
    return this.get(actor, id);
  }

  // Another company's ticket looks exactly like a ticket that doesn't exist.
  private async findScoped(actor: AuthUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...scopeFor(actor) },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }
}