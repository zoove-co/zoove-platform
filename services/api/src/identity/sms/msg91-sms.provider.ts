import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../../config/env';
import { SmsProvider } from './sms.provider';

// MSG91 OTP API (https://docs.msg91.com/otp). Needs an approved DLT template that contains ##OTP##.
// Check the first real delivery end to end: vendors change details, and we only trust what we saw arrive.
@Injectable()
export class Msg91SmsProvider extends SmsProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: Env) {
    super();
  }

  send(): Promise<void> {
    return Promise.reject(new Error('MSG91 sends OTPs through its registered template only; use sendOtp.'));
  }

  override async sendOtp(phoneE164: string, code: string, validMinutes: number): Promise<void> {
    const query = new URLSearchParams({
      template_id: this.config.MSG91_TEMPLATE_ID ?? '',
      mobile: phoneE164.replace('+', ''),
      authkey: this.config.MSG91_AUTH_KEY ?? '',
      otp: code,
      otp_expiry: String(validMinutes),
    });
    const response = await fetch(`https://control.msg91.com/api/v5/otp?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let type: unknown;
    try {
      type = (JSON.parse(text) as { type?: unknown }).type;
    } catch {
      type = undefined;
    }
    // Never log the auth key or the code: the error carries only the vendor's answer.
    if (!response.ok || type !== 'success') throw new Error(`MSG91 responded ${response.status}: ${text.slice(0, 200)}`);
  }
}
