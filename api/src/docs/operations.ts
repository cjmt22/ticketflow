import { loginSchema, registerOrganisationSchema } from '../auth/auth.schemas.js';
import {
  createCommentSchema,
  listCommentsQuerySchema,
} from '../comments/comments.schemas.js';
import {
  assignTicketSchema,
  changeStatusSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from '../tickets/tickets.schemas.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../users/users.schemas.js';
import type { OperationDoc } from './zod-openapi.js';

// Keys look like "METHOD /path", with {param} for path parameters.
export const OPERATIONS: Record<string, OperationDoc> = {
  'GET /api/v1/health': {
    tag: 'System',
    summary: 'Health check',
    description: 'Reports whether the API can reach its database.',
    public: true,
    errors: [503],
  },

  'POST /api/v1/auth/register-organisation': {
    tag: 'Auth',
    summary: 'Register a company',
    description:
      'Creates a company and its first Admin, and logs them in. The refresh token is set as an httpOnly cookie. Rate limited per IP.',
    public: true,
    body: registerOrganisationSchema,
    errors: [400, 409, 429],
  },
  'POST /api/v1/auth/login': {
    tag: 'Auth',
    summary: 'Log in',
    description:
      'Returns an access token (valid 15 minutes) and sets the refresh token as an httpOnly cookie. Wrong passwords and unknown emails return the same error. Rate limited per IP.',
    public: true,
    body: loginSchema,
    errors: [400, 401, 429],
  },
  'POST /api/v1/auth/refresh': {
    tag: 'Auth',
    summary: 'Get a new access token',
    description:
      'Uses the refresh cookie and rotates it. Reusing an old refresh token revokes every session of that user. Rate limited per IP.',
    public: true,
    errors: [401, 429],
  },
  'POST /api/v1/auth/logout': {
    tag: 'Auth',
    summary: 'Log out',
    description: 'Revokes the refresh token and clears the cookie.',
    public: true,
  },
  'GET /api/v1/auth/me': {
    tag: 'Auth',
    summary: 'Current user',
    description: 'The logged-in user and their organisation name.',
    errors: [401],
  },

  'GET /api/v1/users': {
    tag: 'Users',
    summary: 'List users',
    description: 'Admin only. Only users of your own organisation are returned.',
    query: listUsersQuerySchema,
    errors: [400, 401, 403],
  },
  'POST /api/v1/users': {
    tag: 'Users',
    summary: 'Create an agent or customer',
    description: 'Admin only. The user joins your organisation.',
    body: createUserSchema,
    errors: [400, 401, 403, 409],
  },
  'PATCH /api/v1/users/{id}': {
    tag: 'Users',
    summary: 'Update a user',
    description: 'Admin only. Admin accounts cannot be changed here.',
    body: updateUserSchema,
    errors: [400, 401, 403, 404],
  },
  'PATCH /api/v1/users/{id}/deactivate': {
    tag: 'Users',
    summary: 'Deactivate a user',
    description:
      'Admin only. The user can no longer log in, and their sessions end immediately. You cannot deactivate yourself or another admin.',
    errors: [400, 401, 403, 404],
  },

  'POST /api/v1/tickets': {
    tag: 'Tickets',
    summary: 'Create a ticket',
    description: 'Any logged-in user. The ticket starts as OPEN with MEDIUM priority.',
    body: createTicketSchema,
    errors: [400, 401],
  },
  'GET /api/v1/tickets': {
    tag: 'Tickets',
    summary: 'List tickets',
    description:
      'Agents and admins see every ticket in the organisation. Customers see only their own, without the AI fields.',
    query: listTicketsQuerySchema,
    errors: [400, 401],
  },
  'GET /api/v1/tickets/{id}': {
    tag: 'Tickets',
    summary: 'Get a ticket',
    errors: [400, 401, 404],
  },
  'PATCH /api/v1/tickets/{id}': {
    tag: 'Tickets',
    summary: 'Override category or priority',
    description: 'Agents and admins only.',
    body: updateTicketSchema,
    errors: [400, 401, 403, 404],
  },
  'PATCH /api/v1/tickets/{id}/status': {
    tag: 'Tickets',
    summary: 'Change the status',
    description:
      'Flow: OPEN → IN_PROGRESS → RESOLVED → CLOSED. RESOLVED and CLOSED tickets can be reopened to OPEN. Customers may only reopen their own tickets. Every change is written to the audit log.',
    body: changeStatusSchema,
    errors: [400, 401, 403, 404, 409],
  },
  'PATCH /api/v1/tickets/{id}/assignee': {
    tag: 'Tickets',
    summary: 'Assign or unassign a ticket',
    description:
      'Agents and admins only. The assignee must be an active agent or admin in your organisation. Send null to unassign.',
    body: assignTicketSchema,
    errors: [400, 401, 403, 404],
  },

  'GET /api/v1/tickets/{ticketId}/comments': {
    tag: 'Comments',
    summary: 'List the comments on a ticket',
    description: 'Oldest first. Customers never see internal notes.',
    query: listCommentsQuerySchema,
    errors: [400, 401, 404],
  },
  'POST /api/v1/tickets/{ticketId}/comments': {
    tag: 'Comments',
    summary: 'Add a comment',
    description:
      'Only agents and admins can post internal notes. Closed tickets must be reopened first.',
    body: createCommentSchema,
    errors: [400, 401, 403, 404],
  },
};