import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from './tickets.service.js';

const staff: AuthUser = { id: 'agent-1', organisationId: 'org-A', role: 'AGENT' };
const customer: AuthUser = {
  id: 'cust-1',
  organisationId: 'org-A',
  role: 'CUSTOMER',
};

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    title: 'Printer broken',
    description: 'It will not print',
    status: 'OPEN',
    priority: 'MEDIUM',
    category: 'General',
    aiCategory: 'Hardware',
    aiPriority: 'HIGH',
    aiSentiment: 'Frustrated',
    aiSummary: 'Secret summary',
    requesterId: 'cust-1',
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    requester: { id: 'cust-1', fullName: 'Carl' },
    assignee: null,
    ...overrides,
  };
}

function setup() {
  const tx = {
    ticket: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ticket: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new TicketsService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

describe('TicketsService', () => {
  describe('create', () => {
    it('takes the organisation and requester from the actor, not the request', async () => {
      const { service, prisma } = setup();
      prisma.ticket.create.mockResolvedValue(makeTicket());

      await service.create(customer, {
        title: 'Printer broken',
        description: 'It will not print',
      });

      const args = prisma.ticket.create.mock.calls[0]?.[0] as {
        data: { organisationId: string; requesterId: string };
      };
      expect(args.data.organisationId).toBe('org-A');
      expect(args.data.requesterId).toBe('cust-1');
    });
  });

  describe('list', () => {
    it('scopes by organisation and applies filters, search and pagination', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.list(staff, {
        page: 2,
        pageSize: 10,
        status: 'OPEN',
        priority: 'HIGH',
        q: 'printer',
        sort: 'newest',
      });

      const expectedWhere = {
        organisationId: 'org-A',
        status: 'OPEN',
        priority: 'HIGH',
        OR: [
          { title: { contains: 'printer', mode: 'insensitive' } },
          { description: { contains: 'printer', mode: 'insensitive' } },
        ],
      };
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere, skip: 10, take: 10 }),
      );
      expect(prisma.ticket.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('limits customers to tickets they requested', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.list(customer, { page: 1, pageSize: 20, sort: 'newest' });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organisationId: 'org-A', requesterId: 'cust-1' },
        }),
      );
    });

    it('hides AI fields from customers but not from staff', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findMany.mockResolvedValue([makeTicket()]);
      prisma.ticket.count.mockResolvedValue(1);
      const query = { page: 1, pageSize: 20, sort: 'newest' as const };

      const asCustomer = await service.list(customer, query);
      const asStaff = await service.list(staff, query);

      expect(asCustomer.data[0]).not.toHaveProperty('aiSummary');
      expect(asCustomer.data[0]).not.toHaveProperty('aiSentiment');
      expect(asStaff.data[0]).toHaveProperty('aiSummary', 'Secret summary');
    });
  });

  describe('get', () => {
    it("returns 404 for a ticket outside the actor's scope", async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(service.get(customer, 'ticket-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1', organisationId: 'org-A', requesterId: 'cust-1' },
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('applies a valid move and writes an audit log row', async () => {
      const { service, prisma, tx } = setup();
      prisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'ticket-1', status: 'OPEN' })
        .mockResolvedValueOnce(makeTicket({ status: 'IN_PROGRESS' }));

      const result = await service.changeStatus(staff, 'ticket-1', 'IN_PROGRESS');

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organisationId: 'org-A', status: 'OPEN' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organisationId: 'org-A',
          actorId: 'agent-1',
          action: 'TICKET_STATUS_CHANGED OPEN->IN_PROGRESS',
          entityId: 'ticket-1',
        }),
      });
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('rejects a move the state machine does not allow', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValueOnce({
        id: 'ticket-1',
        status: 'OPEN',
      });

      await expect(
        service.changeStatus(staff, 'ticket-1', 'CLOSED'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets customers do nothing except reopen', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValueOnce({
        id: 'ticket-1',
        status: 'RESOLVED',
      });

      await expect(
        service.changeStatus(customer, 'ticket-1', 'CLOSED'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a customer reopen their own resolved ticket', async () => {
      const { service, prisma, tx } = setup();
      prisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'ticket-1', status: 'RESOLVED' })
        .mockResolvedValueOnce(makeTicket({ status: 'OPEN' }));

      await service.changeStatus(customer, 'ticket-1', 'OPEN');

      expect(tx.ticket.updateMany).toHaveBeenCalled();
    });

    it('reports a conflict when someone changed the ticket at the same moment', async () => {
      const { service, prisma, tx } = setup();
      prisma.ticket.findFirst.mockResolvedValueOnce({
        id: 'ticket-1',
        status: 'OPEN',
      });
      tx.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeStatus(staff, 'ticket-1', 'IN_PROGRESS'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("does nothing for another company's ticket", async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.changeStatus(staff, 'ticket-from-org-B', 'IN_PROGRESS'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('refuses an assignee who is not an active agent or admin in the same company', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst.mockResolvedValueOnce({
        id: 'ticket-1',
        status: 'OPEN',
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(staff, 'ticket-1', 'someone-else'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'someone-else',
            organisationId: 'org-A',
            isActive: true,
            role: { in: ['AGENT', 'ADMIN'] },
          },
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('assigns and records it in the audit log', async () => {
      const { service, prisma, tx } = setup();
      prisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'ticket-1', status: 'OPEN' })
        .mockResolvedValueOnce(makeTicket({ assigneeId: 'agent-1' }));
      prisma.user.findFirst.mockResolvedValue({ id: 'agent-1' });

      await service.assign(staff, 'ticket-1', 'agent-1');

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organisationId: 'org-A' },
        data: { assigneeId: 'agent-1' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'TICKET_ASSIGNED' }),
      });
    });

    it('unassigns without looking up an assignee', async () => {
      const { service, prisma, tx } = setup();
      prisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'ticket-1', status: 'OPEN' })
        .mockResolvedValueOnce(makeTicket());

      await service.assign(staff, 'ticket-1', null);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'TICKET_UNASSIGNED' }),
      });
    });
  });

  describe('update', () => {
    it('writes changes with the organisation filter', async () => {
      const { service, prisma } = setup();
      prisma.ticket.findFirst
        .mockResolvedValueOnce({ id: 'ticket-1', status: 'OPEN' })
        .mockResolvedValueOnce(makeTicket({ priority: 'HIGH' }));

      await service.update(staff, 'ticket-1', { priority: 'HIGH' });

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organisationId: 'org-A' },
        data: { category: undefined, priority: 'HIGH' },
      });
    });
  });
});