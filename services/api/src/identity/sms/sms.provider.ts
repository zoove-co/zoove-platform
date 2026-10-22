// The API talks to an SMS vendor only through this interface (decision D5), so MSG91, Twilio or any
// other provider can be swapped in without touching login logic. India needs DLT-registered senders
// and templates; that registration belongs to the real provider (open question 26).
export abstract class SmsProvider {
  abstract send(phoneE164: string, message: string): Promise<void>;
}
