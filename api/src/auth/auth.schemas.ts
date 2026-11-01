   import { z } from 'zod';

   export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

   // bcrypt only uses the first 72 characters, so we cap the length there.
   export const passwordSchema = z
     .string()
     .min(10, 'Password must be at least 10 characters')
     .max(72, 'Password must be at most 72 characters');

   export const registerOrganisationSchema = z.object({
     organisationName: z.string().trim().min(2).max(100),
     fullName: z.string().trim().min(2).max(100),
     email: emailSchema,
     password: passwordSchema,
   });

   export const loginSchema = z.object({
     email: emailSchema,
     password: z.string().min(1).max(72),
   });

   export type RegisterOrganisationDto = z.infer<typeof registerOrganisationSchema>;
   export type LoginDto = z.infer<typeof loginSchema>;