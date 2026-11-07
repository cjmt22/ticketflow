export type Role = 'ADMIN' | 'AGENT' | 'CUSTOMER';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organisationId: string;
}

export interface AuthResult {
  accessToken: string;
  user: User;
}

export interface RegisterInput {
  organisationName: string;
  fullName: string;
  email: string;
  password: string;
}

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  // The AI fields are only sent to agents and admins, never to customers.
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiSentiment?: string | null;
  aiSummary?: string | null;
  requesterId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  requester: PersonRef;
  assignee: PersonRef | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}