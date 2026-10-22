import { DomainError } from '../common/domain-error';

// Indian mobile numbers only for now (the launch city is Mumbai): +91, then 10 digits starting 6 to 9.
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

export function assertIndianMobile(phone: string): void {
  if (!INDIAN_MOBILE.test(phone)) throw new DomainError('INVALID_PHONE', 'Enter a valid Indian mobile number.');
}
