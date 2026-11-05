import { Linking } from 'react-native';

// For now support is email only: any help, question or complaint goes here and gets a reply within 24 hours.
export const SUPPORT_EMAIL = 'admin@zoove.co';

export function openSupport(subject: string, bookingCode?: string): void {
  const sub = bookingCode ? `${subject} (${bookingCode})` : subject;
  void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(sub)}`).catch(() => undefined);
}
