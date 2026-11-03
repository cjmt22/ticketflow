import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from './ticket-status.js';

export const ticketIdSchema = z.uuid();

export const createTicketSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(10_000),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'updated']).default('newest'),
});

export const updateTicketSchema = z
  .object({
    category: z.string().trim().min(1).max(50).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .refine((v) => v.category !== undefined || v.priority !== undefined, {
    message: 'Provide at least one field to update',
  });

export const changeStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

export const assignTicketSchema = z.object({
  assigneeId: z.uuid().nullable(),
});

export type CreateTicketDto = z.infer<typeof createTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
export type AssignTicketDto = z.infer<typeof assignTicketSchema>;