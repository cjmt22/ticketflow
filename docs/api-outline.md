# API Outline

Base path: `/api/v1`. All requests and responses are JSON.

## Conventions
- **Auth:** short-lived access token (JWT) sent in the `Authorization: Bearer` header. The refresh token lives in an httpOnly cookie.
- **Tenant scoping:** the organisation always comes from the logged-in user's token, never from the URL or request body.
- **Pagination:** `?page=1&pageSize=20`. Responses look like `{ data, page, pageSize, total }`.
- **Errors:** `{ statusCode, message, errors? }`.
- **Status codes:** 200 OK, 201 Created, 204 No Content, 400 validation error, 401 not logged in, 403 wrong role, 404 not found.
- A ticket from another organisation returns **404**, not 403, so other tenants' IDs are never revealed.

## Auth
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| POST | /auth/register-organisation | Public | Create an organisation and its first Admin | A1 |
| POST | /auth/login | Public | Log in, receive tokens | |
| POST | /auth/refresh | Cookie | Get a new access token | |
| POST | /auth/logout | Any | End the session | |
| GET | /auth/me | Any | Current user and organisation | |

## Users
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| GET | /users | Admin | List users in my organisation | A2 |
| POST | /users | Admin | Create an Agent or Customer | A2 |
| PATCH | /users/:id | Admin | Update name or role | A2 |
| PATCH | /users/:id/deactivate | Admin | Deactivate a user | A3 |

## Tickets
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| POST | /tickets | Customer, Agent | Create a ticket (AI triage runs in the background) | C1, S1 |
| GET | /tickets | Agent, Admin see all; Customer sees own | List with filters: `status`, `priority`, `category`, `assigneeId`, `q` (search), `sort` | G1, G2, C2 |
| GET | /tickets/:id | Role-scoped | Ticket detail | C2 |
| PATCH | /tickets/:id | Agent, Admin | Override category or priority | G8 |
| PATCH | /tickets/:id/status | Agent, Admin; Customer can reopen own | Change status (follows the status flow) | G4, C4 |
| PATCH | /tickets/:id/assignee | Agent, Admin | Assign a ticket | G3 |

## Comments
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| GET | /tickets/:id/comments | Role-scoped (Customers never see internal notes) | List comments | C3 |
| POST | /tickets/:id/comments | Anyone with access; only Agent/Admin can set `isInternal` | Add a comment | G5, C3 |

## Attachments
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| POST | /tickets/:id/attachments/upload-url | Anyone with access | Get a presigned upload URL | C1 |
| POST | /tickets/:id/attachments | Anyone with access | Confirm the upload and save metadata | C1 |
| GET | /attachments/:id/download-url | Anyone with access | Get a presigned download URL | |

## AI
AI triage (category, priority, sentiment) runs automatically after a ticket is created, so it has no endpoint.

| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| POST | /tickets/:id/ai/summary | Agent, Admin | Summarise the thread | G6 |
| POST | /tickets/:id/ai/suggested-reply | Agent, Admin | Draft a reply for the Agent to edit | G7 |

## Dashboard, audit, system
| Method | Path | Who | Purpose | Story |
|--------|------|-----|---------|-------|
| GET | /dashboard/stats | Admin | Ticket counts by status and priority | A4 |
| GET | /audit-logs | Admin | Paginated audit trail | S3 |
| GET | /health | Public | Health check for hosting and monitoring | |