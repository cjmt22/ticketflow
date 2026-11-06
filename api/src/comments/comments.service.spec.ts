import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CommentsService } from './comments.service.js';

const staff: AuthUser = { id: 'agent-1', organisationId: 'org-A', role: 'AGENT' };
const customer: AuthUser = {
  id: 'cust-1',
  organisationId: 'org-A',
  role: 'CUSTOMER',
};

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    ticketId: 'ticket-1',
    body: 'Hello',
    isInternal: false,
    createdAt: new Date(),
    author: { id: 'cust-1', fullName: 'Carl', role: 'CUSTOMER' },
    ...overrides,
  };
}

function setup() {
  const tx = {
    comment: { create: vi.fn() },
    ticket: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    ticket: {
      findFirst: vi.fn().mockResolvedValue({ id: 'ticket-1', status: 'OPEN' }),
    },
    comment: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new CommentsService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

const query = { page: 1, pageSize: 50 };

describe('CommentsService', () => {
  describe('list', () => {
    it('shows staff every comment, scoped to the ticket and company', async () => {
      const { service, prisma } = setup();
      prisma.comment.findMany.mockResolvedValue([makeComment()]);
      prisma.comment.count.mockResolvedValue(1);

      await service.list(staff, 'ticket-1', query);

      const expectedWhere = {
        ticketId: 'ticket-1',
        ticket: { organisationId: 'org-A' },
      };
      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere, skip: 0, take: 50 }),
      );
      expect(prisma.comment.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('never shows internal notes to customers', async () => {
      const { service, prisma } = setup();
      prisma.comment.findMany.mockResolvedValue([]);
      prisma.comment.count.mockResolvedValue(0);

      await service.list(customer, 'ticket-1', query);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ticketId: 'ticket-1',
            ticket: { organisationId: 'org-A' },
            isInternal: false,
          },
        }),
      );
    });

    it("looks the ticket up with the actor's scope", async () => {
      const { service, prisma } = setup();
      prisma.comment.findMany.mockResolvedValue([]);
      prisma.comment.count.mockResolvedValue(0);

      await service.list(customer, 'ticket-1', query);

      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'ticket-1',
            organisationId: 'org-A',
            requesterId: 'cust-1',
          },
        }),
      );
    });

    it('returns 404 without reading comments when the ticket is out of scope', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(service.list(staff, 'ticket-1', query)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('takes the author from the actor and touches the ticket in the same transaction', async () => {
      const { service, tx } = setup();
      tx.comment.create.mockResolvedValue(makeComment());

      await service.create(customer, 'ticket-1', {
        body: 'Still broken',
        isInternal: false,
      });

      expect(tx.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            ticketId: 'ticket-1',
            authorId: 'cust-1',
            body: 'Still broken',
            isInternal: false,
          },
        }),
      );
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organisationId: 'org-A' },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it('lets staff post internal notes', async () => {
      const { service, tx } = setup();
      tx.comment.create.mockResolvedValue(makeComment({ isInternal: true }));

      await service.create(staff, 'ticket-1', {
        body: 'Check the logs',
        isInternal: true,
      });

      expect(tx.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isInternal: true }),
        }),
      );
    });

    it('forbids customers from posting internal notes', async () => {
      const { service, prisma } = setup();

      await expect(
        service.create(customer, 'ticket-1', { body: 'Sneaky', isInternal: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects comments on a closed ticket', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValue({
        id: 'ticket-1',
        status: 'CLOSED',
      });

      await expect(
        service.create(staff, 'ticket-1', { body: 'Late', isInternal: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("does nothing for another company's ticket", async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.create(staff, 'ticket-from-org-B', {
          body: 'Hello',
          isInternal: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});