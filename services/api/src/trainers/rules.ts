// Trainer onboarding rules. ASSUMPTIONS until Pratik and Akash confirm (see open questions 53-55).

export const SINGLE_DOCUMENT_KINDS = ['aadhaar_front', 'aadhaar_back', 'pan_card', 'selfie'] as const;
export const DOCUMENT_KINDS = [...SINGLE_DOCUMENT_KINDS, 'certificate', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

// Documents a trainer must upload before submitting. Pratik confirmed (24 Oct 2026) that a certificate is mandatory: at least one.
export const REQUIRED_DOCUMENT_KINDS: readonly DocumentKind[] = [...SINGLE_DOCUMENT_KINDS, 'certificate'];

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_EXTRA_DOCUMENTS = 10;
export const MIN_AGE_YEARS = 18;
export const SIGNED_LINK_SECONDS = 300;

export const CONSENT_VERSION = '2026-10';

// PAN: 3 letters, 1 letter for the holder type (P person, C company, H HUF, F firm, A AOP, T trust, B body of individuals, L local authority, J juridical person, G government), 1 letter, 4 digits, 1 letter.
export const PAN_PATTERN = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;

// A real Indian mobile: +91, then 10 digits starting 6 to 9. Ten of the same digit (9999999999) is never a real number.
export const PHONE_PATTERN = /^\+91[6-9][0-9]{9}$/;
export const looksFakePhone = (e164: string): boolean => /^\+91(\d)\1{9}$/.test(e164);

export type SniffedFile = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; ext: 'jpg' | 'png' | 'webp' | 'pdf' };

// Trust the file's own first bytes, not the name or the type the browser claims.
export function sniffFile(buffer: Buffer): SniffedFile | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const [year, month, day] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - year;
  const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
