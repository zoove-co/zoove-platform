import { z } from 'zod';

type Translate = (key: string) => string;

export function buildProfileSchema(t: Translate) {
  return z.object({
    firstName: z.string().trim().min(2, t('profile.errorFirstName')),
    lastName: z.string().trim().optional(),
    email: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || z.string().email().safeParse(value).success, t('profile.errorEmail')),
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof buildProfileSchema>>;
