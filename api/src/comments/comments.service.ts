import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { scopeFor } from '../tickets/ticket-scope.js';
import type {
  CreateCommentDto,
  ListCommentsQuery,
} from './comments.schemas.js';

// No author email: customers can read their ticket's thread.
const COMMENT_SELECT = {
  id: true,
  ticketId: true,
  body: true,
  isInternal: true,
  createdAt: true,
  author: { select: { id: true, fullName: true, role: true } },
} as const;

@Injectable()
export class CommentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, ticketId: string, query: ListCommentsQuery) {
    await this.findTicket(actor, ticketId);

    const where = {
      ticketId,
      // Second safety net: the comment's ticket must be in the actor's company.
      ticket: { organisationId: actor.organisationId },
      // Customers never see internal notes.
      ...(actor.role === 'CUSTOMER' ? { isInternal: false } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        select: COMMENT_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { data, page: query.page, pageSize: query.pageSize, total };
  }

  async create(actor: AuthUser, ticketId: string, dto: CreateCommentDto) {
    const ticket = await this.findTicket(actor, ticketId);

    if (dto.isInternal && actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot post internal notes');
    }
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException(
        'This ticket is closed. Reopen it to add a comment',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: actor.id,
          body: dto.body,
          isInternal: dto.isInternal,
        },
        select: COMMENT_SELECT,
      });
      // A new comment counts as activity on the ticket.
      await tx.ticket.updateMany({
        where: { id: ticket.id, organisationId: actor.organisationId },
        data: { updatedAt: new Date() },
      });
      return comment;
    });
  }

  // Another company's ticket looks exactly like a ticket that doesn't exist.
  private async findTicket(actor: AuthUser, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, ...scopeFor(actor) },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }
}