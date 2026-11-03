import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  assignTicketSchema,
  changeStatusSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdSchema,
  updateTicketSchema,
  type AssignTicketDto,
  type ChangeStatusDto,
  type CreateTicketDto,
  type ListTicketsQuery,
  type UpdateTicketDto,
} from './tickets.schemas.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketDto,
  ) {
    return this.tickets.create(actor, body);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(listTicketsQuerySchema))
    query: ListTicketsQuery,
  ) {
    return this.tickets.list(actor, query);
  }

  @Get(':id')
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ZodValidationPipe(ticketIdSchema)) id: string,
  ) {
    return this.tickets.get(actor, id);
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ZodValidationPipe(ticketIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateTicketSchema)) body: UpdateTicketDto,
  ) {
    return this.tickets.update(actor, id, body);
  }

  // Staff can make any valid move; the service lets customers only reopen.
  @Patch(':id/status')
  changeStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ZodValidationPipe(ticketIdSchema)) id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusDto,
  ) {
    return this.tickets.changeStatus(actor, id, body.status);
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id/assignee')
  assign(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ZodValidationPipe(ticketIdSchema)) id: string,
    @Body(new ZodValidationPipe(assignTicketSchema)) body: AssignTicketDto,
  ) {
    return this.tickets.assign(actor, id, body.assigneeId);
  }
}