import type { ApplicationView } from './api';

export const STEP_TITLES = ['About you', 'Where you live', 'Your experience', 'ID details', 'Documents', 'Review'] as const;
export const LAST_STEP = STEP_TITLES.length - 1;

// The service asks for these keys when something is missing. Each one lives on a step.
export function stepOfMissing(key: string): number {
  if (key.startsWith('document:')) return 4;
  if (['firstName', 'lastName', 'dateOfBirth', 'gender', 'email', 'phone'].includes(key)) return 0;
  if (['addressLine', 'addressArea', 'addressPincode'].includes(key)) return 1;
  if (['specialties', 'experienceYears'].includes(key)) return 2;
  if (['panNumber', 'aadhaarLast4'].includes(key)) return 3;
  return 0;
}

// Resume where the trainer left off: the first step that still has something missing, or the review.
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
