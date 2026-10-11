import { z } from 'zod';

type Translate = (key: string) => string;

// Built from a translate function so validation messages come from the translation file.
export function buildAddressSchema(t: Translate) {
  return z.object({
    label: z.string().trim().min(1, t('booking.errorLabel')),
    line: z.string().trim().min(3, t('booking.errorLine')),
    area: z.string().trim().min(2, t('booking.errorArea')),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, t('booking.errorPincode')),
  });
}

export type AddressFormValues = z.infer<ReturnType<typeof buildAddressSchema>>;
