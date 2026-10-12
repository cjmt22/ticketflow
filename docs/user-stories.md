# User Stories

TicketFlow has three roles. Each user belongs to exactly one organisation (tenant).

- **Admin**: owns the organisation and manages its users
- **Agent**: handles support tickets
- **Customer**: submits and follows their own tickets

Priority: **MVP** = must be built for v1.0, **Stretch** = only if time allows.

## Admin
| ID | Story | Priority |
|----|-------|----------|
| A1 | As a new company, I can register an organisation and become its Admin. | MVP |
| A2 | As an Admin, I can create Agent and Customer accounts in my organisation. | MVP |
| A3 | As an Admin, I can deactivate a user so they can no longer log in. | MVP |
| A4 | As an Admin, I can see a dashboard of open tickets by status and priority. | MVP |
| A5 | As an Admin, I can set response-time targets (SLA) per priority. | Stretch |

## Agent
| ID | Story | Priority |
|----|-------|----------|
| G1 | As an Agent, I can view all tickets in my organisation and filter by status, priority, category, and assignee. | MVP |
| G2 | As an Agent, I can search tickets by keyword. | MVP |
| G3 | As an Agent, I can assign a ticket to myself or another Agent. | MVP |
| G4 | As an Agent, I can move a ticket through its statuses. | MVP |
| G5 | As an Agent, I can reply publicly or add an internal note only agents can see. | MVP |
| G6 | As an Agent, I can read an AI summary of a long ticket thread. | MVP |
| G7 | As an Agent, I can get an AI-suggested reply, edit it, then send it. | MVP |
| G8 | As an Agent, I can override the AI-chosen category and priority. | MVP |

## Customer
| ID | Story | Priority |
|----|-------|----------|
| C1 | As a Customer, I can submit a ticket with a title, description, and attachment. | MVP |
| C2 | As a Customer, I can see only my own tickets. | MVP |
| C3 | As a Customer, I can comment on my tickets. | MVP |
| C4 | As a Customer, I can reopen a resolved ticket. | MVP |
| C5 | As a Customer, I receive an email when an Agent replies. | Stretch |

## System requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| S1 | New tickets are automatically triaged by AI (category, priority, sentiment). | MVP |
| S2 | A user can never read or change another organisation's data. | MVP |
| S3 | Important actions (status changes, assignments) are written to an audit log. | MVP |
| S4 | Tickets that miss their SLA are flagged. | Stretch |

## Ticket status flow
OPEN → IN_PROGRESS → RESOLVED → CLOSED
A RESOLVED or CLOSED ticket can be reopened (back to OPEN).