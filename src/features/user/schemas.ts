import { z } from 'zod';

// Limits copied from esavi-backend's createUserValidator (user.validator.ts:33-57), not invented:
// 150 for the names, 250 for email and username, 50 for phone, a minimum of 8 for the password and
// nothing else. `displayName`, `isActive` and `requiresPasswordChange` are absent on purpose — the
// backend answers 400 if any of them travels, so the form cannot offer them (SPEC FE20 §3.5).
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const createUserSchema = z.object({
  // Returned in Title Case by the backend, which normalizes before encrypting: what comes back
  // differs from what was typed, and the form never compares the two (SPEC FE20 §7).
  firstName: z.string().trim().min(1).max(150),
  lastName: z.string().trim().min(1).max(150),
  email: z.string().trim().min(1).email().max(250),
  // Trimmed before the length check, as the validator does: a password of eight spaces is not one.
  password: z.string().trim().min(8),
  // Optional and case-sensitive: the column is encrypted with a fixed IV, so `DPeralta` and
  // `dperalta` are two different users and neither finds the other (SPEC F62 §7, R2).
  username: z.preprocess(emptyToUndefined, z.string().trim().max(250).optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  // The form field is `roleIds`; it travels as `roleId` in the body, which ESAVI-USER-001 accepts
  // as a string or an array. At least one: a user with no role can do nothing.
  roleIds: z.array(z.string().uuid()).min(1),
});

// ESAVI-USER-004's five fields. No `password` and no `roleIds`: the first belongs to the
// change-password operation and the second to the user-role endpoints (updateUserValidator).
//
// Not `.partial()`, even though §3.5 calls the five optional: the full object travels on every PUT
// (CONVENTIONS.md §6.5, no diff computed here), and `updateUserValidator` answers 400 for a field
// that travels empty — `body('email').optional().notEmpty()`. Optional means "may be absent", not
// "may be blank", so the three the backend will not accept blank stay required here, exactly as
// `UpdateUserInput` (§3.3) declares them. `username` and `phone` keep their `optional()`.
export const updateUserSchema = createUserSchema.omit({ password: true, roleIds: true });

export type UserFormValues = z.infer<typeof createUserSchema>;
export type UserUpdateFormValues = z.infer<typeof updateUserSchema>;

// SPEC FE20 §3.5. The two 409 of `005A` are not here: they belong to no field of this form and are
// shown as a toast with a message of their own.
export const userErrorFieldMap: Partial<Record<string, keyof UserFormValues>> = {
  USER_001_EMAIL_EXISTS: 'email',
  USER_004_EMAIL_EXISTS: 'email',
  USER_001_USERNAME_EXISTS: 'username',
  USER_004_USERNAME_EXISTS: 'username',
  USER_001_ROLE_NOT_FOUND: 'roleIds',
  USER_001_ROLE_LEVEL_EXCEEDED: 'roleIds',
};

// The edit form has neither `password` nor `roleIds`, so only the two `004` codes can land on a
// field. The `001` codes are unreachable from a `PUT` and would not type-check against its values.
export const userUpdateErrorFieldMap: Partial<Record<string, keyof UserUpdateFormValues>> = {
  USER_004_EMAIL_EXISTS: 'email',
  USER_004_USERNAME_EXISTS: 'username',
};
