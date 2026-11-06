import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;