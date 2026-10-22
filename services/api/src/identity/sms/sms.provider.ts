// The API talks to an SMS vendor only through this interface (decision D5), so MSG91, Twilio or any
// other provider can be swapped in without touching login logic. India needs DLT-registered senders
// and templates; that registration belongs to the real provider (open question 26 and 56).
export abstract class SmsProvider {
  abstract send(phoneE164: string, message: string): Promise<void>;

  // Vendors with a registered OTP template (India DLT) send their own fixed text and only need the code.
  // The default sends the sentence below, which is what the console provider prints.
  sendOtp(phoneE164: string, code: string, validMinutes: number): Promise<void> {
    return this.send(phoneE164, `${code} is your Zoove verification code. It is valid for ${validMinutes} minutes.`);
  }
}
