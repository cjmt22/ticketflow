import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ticketIdSchema } from '../tickets/tickets.schemas.js';
import {
  createCommentSchema,
  listCommentsQuerySchema,
  type CreateCommentDto,
  type ListCommentsQuery,
} from './comments.schemas.js';
import { CommentsService } from './comments.service.js';

@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Param('ticketId', new ZodValidationPipe(ticketIdSchema)) ticketId: string,
    @Query(new ZodValidationPipe(listCommentsQuerySchema))
    query: ListCommentsQuery,
  ) {
    return this.comments.list(actor, ticketId, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Param('ticketId', new ZodValidationPipe(ticketIdSchema)) ticketId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentDto,
  ) {
    return this.comments.create(actor, ticketId, body);
  }
}