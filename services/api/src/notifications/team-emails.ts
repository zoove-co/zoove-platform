import type { EmailMessage } from '../email/email.provider';
import { layout } from './trainer-emails';

export function teamInviteEmail(to: string, ctx: { name: string; jobTitle: string; invitedBy: string }, adminUrl: string): EmailMessage {
  const firstName = ctx.name.trim().split(/\s+/)[0] || 'there';
  const { html, text } = layout(
    'You have been added to Zoove admin',
    [
      `Hi ${firstName},`,
      `${ctx.invitedBy} added you to the Zoove admin team as ${ctx.jobTitle}.`,
      `To sign in, open the admin panel and enter this email address (${to}). We will email you a one-time code. There is no password to set up.`,
    ],
    { label: 'Open Zoove admin', url: adminUrl },
    'You received this because you were added to the Zoove admin team. If this is a mistake, you can ignore it.',
  );
  return { to, subject: 'You have been added to Zoove admin', html, text };
}
