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

export function partyRequestedEmail(to: string, ctx: { name: string; occasion: string; guests: number; when: string; where: string; phone: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    'New party request',
    [
      `${ctx.name} asked for a ${ctx.occasion} party for ${ctx.guests} guests.`,
      `When: ${ctx.when}. Where: ${ctx.where}.`,
      `Call them on ${ctx.phone} to confirm, then mark it confirmed in the admin panel.`,
    ],
    { label: 'Open party requests', url: adminUrl },
    'You received this because you are on the Zoove ops notification list.',
  );
  return { to, subject: `New party request: ${ctx.occasion}, ${ctx.guests} guests`, html, text };
}
