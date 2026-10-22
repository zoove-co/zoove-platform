export type EmailMessage = { to: string; subject: string; html: string; text: string };

export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}
