import type { ApplicationView, SaveBody } from '@/lib/api';

// The same steps, rules and wording as the Join Zoove web page, so both behave identically.

export const STEP_TITLES = ['About you', 'Where you live', 'Your experience', 'ID details', 'Documents', 'Review'] as const;
export const LAST_STEP = STEP_TITLES.length - 1;

/** Each key the service reports as missing lives on one step. */
export function stepOfMissing(key: string): number {
  if (key.startsWith('document:')) return 4;
  if (['firstName', 'lastName', 'dateOfBirth', 'gender', 'email', 'phone'].includes(key)) return 0;
  if (['addressLine', 'addressArea', 'addressPincode'].includes(key)) return 1;
  if (['specialties', 'experienceYears'].includes(key)) return 2;
  if (['panNumber', 'aadhaarLast4'].includes(key)) return 3;
  return 0;
}

/** Resume where the trainer left off: the first step with something missing, or the review. */
export function startingStep(view: ApplicationView): number {
  if (view.missing.length === 0) return LAST_STEP;
  return Math.min(...view.missing.map(stepOfMissing));
}

// Used only if the live list cannot be loaded. The slugs are what the API stores.
export const FALLBACK_SERVICES = [
  { slug: 'yoga', name: 'Yoga' },
  { slug: 'pilates', name: 'Pilates' },
  { slug: 'strength', name: 'HIIT/Strength' },
  { slug: 'zumba', name: 'Zumba' },
];
export const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Punjabi'] as const;
export const GENDERS: [string, string][] = [
  ['female', 'Female'],
  ['male', 'Male'],
  ['other', 'Other'],
  ['prefer_not_to_say', 'Prefer not to say'],
];

export type Form = {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // typed as DD-MM-YYYY; sent to the API as YYYY-MM-DD
  gender: string;
  phone: string; // 10 digits, without +91
  email: string;
  addressLine: string;
  addressArea: string;
  addressPincode: string;
  specialties: string[];
  experienceYears: string;
  languages: string[];
  bio: string;
  panNumber: string;
  aadhaarLast4: string;
};
export type Errors = Partial<Record<keyof Form, string>>;

export function toForm(view: ApplicationView): Form {
  const f = view.form;
  return {
    firstName: f.firstName ?? '',
    lastName: f.lastName ?? '',
    dateOfBirth: dobToDisplay(f.dateOfBirth ?? ''),
    gender: f.gender ?? '',
    phone: (f.phone ?? '').replace(/^\+91/, ''),
    email: f.email ?? '',
    addressLine: f.addressLine ?? '',
    addressArea: f.addressArea ?? '',
    addressPincode: f.addressPincode ?? '',
    specialties: f.specialties,
    experienceYears: f.experienceYears === null ? '' : String(f.experienceYears),
    languages: f.languages,
    bio: f.bio ?? '',
    panNumber: '', // never sent back by the server; only the last 4 characters are kept
    aadhaarLast4: f.aadhaarLast4 ?? '',
  };
}

// 3 letters, a holder-type letter (P is a person), 1 letter, 4 digits, 1 letter.
const PAN = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;

export function ageOf(dob: string, now = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/** True for a real calendar date written YYYY-MM-DD (rejects 31 February, month 13, and so on). */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validate(step: number, form: Form, view: ApplicationView): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (!form.firstName.trim()) errors.firstName = 'Enter your first name.';
    if (!form.lastName.trim()) errors.lastName = 'Enter your last name.';
    const dob = dobFromDisplay(form.dateOfBirth);
    if (!form.dateOfBirth) errors.dateOfBirth = 'Enter your date of birth.';
    else if (!dob || !isRealDate(dob)) errors.dateOfBirth = 'Enter a real date as DD-MM-YYYY.';
    else if (ageOf(dob) < 18) errors.dateOfBirth = 'You must be at least 18 years old to train with Zoove.';
    if (!form.gender) errors.gender = 'Choose one option.';
    if (form.phone.length !== 10) errors.phone = `A mobile number has 10 digits. You entered ${form.phone.length}.`;
    else if (!/^[6-9]/.test(form.phone)) errors.phone = 'An Indian mobile number starts with 6, 7, 8 or 9.';
    else if (/^(\d)\1{9}$/.test(form.phone)) errors.phone = 'Enter your real mobile number.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  }
  if (step === 1) {
    if (!form.addressLine.trim()) errors.addressLine = 'Enter your flat, building and street.';
    if (!form.addressArea.trim()) errors.addressArea = 'Enter your area or locality.';
    if (!/^[1-9][0-9]{5}$/.test(form.addressPincode)) errors.addressPincode = 'Enter a 6-digit pincode.';
  }
  if (step === 2) {
    if (form.specialties.length === 0) errors.specialties = 'Choose at least one.';
    const years = Number(form.experienceYears);
    if (form.experienceYears === '' || !Number.isInteger(years) || years < 0 || years > 60) errors.experienceYears = 'Enter your years of experience (0 to 60).';
  }
  if (step === 3) {
    const pan = form.panNumber.trim().toUpperCase();
    if (!pan && !view.form.panLast4) errors.panNumber = 'Enter your PAN number.';
    else if (pan && !PAN.test(pan)) errors.panNumber = pan.length !== 10 ? `A PAN has 10 characters. You entered ${pan.length}.` : 'This is not a valid PAN. It looks like ABCPE1234F: 5 letters, 4 digits, 1 letter, and the 4th letter is P for a person.';
    if (!/^[0-9]{4}$/.test(form.aadhaarLast4)) errors.aadhaarLast4 = `Enter exactly 4 digits. You entered ${form.aadhaarLast4.length}.`;
  }
  return errors;
}

/** What to save when the trainer leaves a step. Only that step's fields are sent. */
export function bodyFor(step: number, form: Form): SaveBody {
  if (step === 0) {
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: dobFromDisplay(form.dateOfBirth),
      gender: form.gender as NonNullable<SaveBody['gender']>,
      phone: `+91${form.phone}`,
      email: form.email.trim().toLowerCase(),
    };
  }
  if (step === 1) return { addressLine: form.addressLine.trim(), addressArea: form.addressArea.trim(), addressPincode: form.addressPincode };
  if (step === 2) return { specialties: form.specialties, experienceYears: Number(form.experienceYears), languages: form.languages, ...(form.bio.trim() ? { bio: form.bio.trim() } : {}) };
  const body: SaveBody = { aadhaarLast4: form.aadhaarLast4 };
  const pan = form.panNumber.trim().toUpperCase();
  if (pan) body.panNumber = pan;
  return body;
}

// ---- Date of birth: the phone keyboard types DD-MM-YYYY, the API wants YYYY-MM-DD ----
export const dobToDisplay = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : iso);
export function dobFromDisplay(typed: string): string {
  const digits = typed.replace(/\D/g, '').slice(0, 8);
  if (digits.length < 8) return '';
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}
/** Adds the dashes while typing: 12031995 shows as 12-03-1995. */
export function formatDobTyping(typed: string): string {
  const digits = typed.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('-');
}
