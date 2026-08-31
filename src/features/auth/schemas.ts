import { z } from 'zod';

// Mirrors auth.validator.ts (backend): a valid email format, and password only required to be
// non-empty — no minimum length, so an existing shorter password can still log in and be
// changed from inside the app (SPEC FE01 §3.5).
export const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().trim().min(1),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
