import { z } from 'zod';

// Mirrors auth.validator.ts (backend): a valid email format, and password only required to be
// non-empty — no minimum length, so an existing shorter password can still log in and be
// changed from inside the app (SPEC FE01 §3.5).
export const loginSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().trim().min(1),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// forgotPasswordValidator (backend): the email is the whole body, same format as login.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1).email(),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// resetPasswordValidator (backend): newPassword min 8. confirmPassword is client-only — the
// backend never sees it (SPEC FE01 §3.5).
export const resetPasswordSchema = z
  .object({
    newPassword: z.string().trim().min(8),
    confirmPassword: z.string().trim().min(1),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// changePasswordValidator (backend): newPassword min 8. currentPassword only non-empty — its
// real check is the bcrypt compare on the server. confirmPassword is client-only.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().trim().min(1),
    newPassword: z.string().trim().min(8),
    confirmPassword: z.string().trim().min(1),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
