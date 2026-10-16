# Architecture Decisions

Short records of the main technical choices in TicketFlow and the reasoning behind them.

| # | Decision | Status |
|---|----------|--------|
| 1 | NestJS (TypeScript) for the backend | Accepted |
| 2 | PostgreSQL with Prisma | Accepted |
| 3 | Shared database, `organisation_id` on every table, for multi-tenancy | Accepted |
| 4 | Short-lived JWT plus refresh token in an httpOnly cookie | Accepted |
| 5 | AI calls behind an interface and run as background jobs | Accepted |

---

## 1. NestJS (TypeScript) for the backend

**Context:** I need a backend that fits remote-job demand for TypeScript and Node, and I already know ASP.NET Core from my first project.

**Decision:** Use NestJS.

**Why:**
- It uses controllers, services, dependency injection, and guards, the same ideas as ASP.NET Core, so I can reuse what I know while learning TypeScript.
- It has built-in support for validation, OpenAPI docs, and testing.
- The structure keeps a larger codebase organised.

**Trade-offs:** More boilerplate than plain Express, and a steeper learning curve at the start.

**Alternatives considered:** Express (simpler but less structure), ASP.NET Core (already done in my first project).

---

## 2. PostgreSQL with Prisma

**Context:** The data is relational: organisations, users, tickets, comments.

**Decision:** Use PostgreSQL, accessed through the Prisma ORM.

**Why:**
- Relational data with foreign keys fits the model.
- Prisma gives type-safe queries and easy migrations.
- Free hosted options exist for deployment.

**Trade-offs:** Prisma hides some SQL details, and complex reports may need raw queries.

**Alternatives considered:** MongoDB (weaker fit for relational data), TypeORM (less type-safe).

---

## 3. Shared database with `organisation_id` on every table

**Context:** Each company must only ever see its own data.

**Decision:** Use one database and one set of tables. Every tenant-owned table has an `organisation_id`, and every query filters by it. The organisation comes from the logged-in user's token, never from the request.

**Why:**
- It's the simplest design to build, deploy, and migrate.
- A separate database per tenant would be too costly for a small project.
- Automated tests will prove that tenant A can never read tenant B's data.

**Trade-offs:** One missing filter could leak data, so tenant scoping must be centralised and tested.

**Alternatives considered:** Database per tenant, schema per tenant.

---

## 4. Short-lived JWT plus refresh token in an httpOnly cookie

**Context:** I need secure login for a browser app.

**Decision:** Issue a short-lived access token (JWT) sent in the `Authorization` header, plus a longer-lived refresh token stored in an httpOnly cookie.

**Why:**
- An httpOnly cookie can't be read by JavaScript, which reduces the damage from XSS attacks.
- A short-lived access token limits the damage if it's stolen.

**Trade-offs:** More moving parts than a single long-lived token, and cookies need careful CORS and `SameSite` settings.

**Alternatives considered:** Storing a single long-lived token in localStorage.

---

## 5. AI behind an interface, run as background jobs

**Context:** AI triage calls an external LLM, which can be slow, rate-limited, or unavailable. I also want to use free tiers and may switch providers.

**Decision:** Put the AI provider behind a small interface, and run triage in the background after a ticket is created.

**Why:**
- Ticket creation stays fast and never fails because the AI is down.
- I can swap providers without touching business code.
- AI results are validated against a schema, and Agents can override them.
- AI values are stored in separate columns, so the original suggestion is never lost.

**Trade-offs:** Triage results appear a few seconds late, and I need a simple job queue.

**Alternatives considered:** Calling the LLM during the request.