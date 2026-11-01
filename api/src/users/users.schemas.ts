import { z } from 'zod';
import { emailSchema, passwordSchema } from '../auth/auth.schemas.js';

export const idParamSchema = z.uuid();

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['AGENT', 'CUSTOMER']),
});

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    role: z.enum(['AGENT', 'CUSTOMER']).optional(),
  })
  .refine((value) => value.fullName !== undefined || value.role !== undefined, {
    message: 'Provide at least one field to update',
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;