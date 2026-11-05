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

export function trainerCancelledEmail(to: string, ctx: { sessionCode: string; serviceName: string; when: string; reason: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    `A trainer cancelled session ${ctx.sessionCode}`,
    [
      `The trainer cancelled the ${ctx.serviceName} session ${ctx.sessionCode} planned for ${ctx.when}.`,
      `Reason given: ${ctx.reason}`,
      'The customer has been told we are finding another trainer. Open the session, check the details and assign a new trainer.',
    ],
    { label: 'Open the session', url: adminUrl },
    'You received this because you are on the Zoove ops notification list.',
  );
  return { to, subject: `Trainer cancelled: session ${ctx.sessionCode} needs a new trainer`, html, text };
}

export function sessionOverdueEmail(to: string, ctx: { sessionCode: string; serviceName: string; when: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    `Session ${ctx.sessionCode} has no trainer and its time has passed`,
    [
      `The ${ctx.serviceName} session ${ctx.sessionCode} was planned for ${ctx.when} and still has no trainer.`,
      'The customer has been told, and can move the session to another time or cancel it. Please call them to apologise and help them rebook.',
    ],
    { label: 'Open the session', url: adminUrl },
    'You received this because you are on the Zoove ops notification list.',
  );
  return { to, subject: `Overdue: session ${ctx.sessionCode} has no trainer`, html, text };
}

const OPS_FOOTER = 'You received this because you are on the Zoove ops notification list.';

export function sessionUnfilledEmail(to: string, ctx: { sessionCode: string; serviceName: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    `No trainer took instant session ${ctx.sessionCode}`,
    [
      `The instant ${ctx.serviceName} session ${ctx.sessionCode} went to every trainer nearby and nobody accepted it.`,
      'The customer has been told, and can pick another date or cancel. You can also assign a trainer yourself or call the customer.',
    ],
    { label: 'Open the session', url: adminUrl },
    OPS_FOOTER,
  );
  return { to, subject: `Unfilled: instant session ${ctx.sessionCode}`, html, text };
}

export function sessionNotClosedEmail(to: string, ctx: { sessionCode: string; serviceName: string; when: string; trainerName: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    `Session ${ctx.sessionCode} is still open after it ended`,
    [
      `The ${ctx.serviceName} session ${ctx.sessionCode} with ${ctx.trainerName} was planned for ${ctx.when} and nobody has marked it done.`,
      'Check with the trainer and the customer. Mark it completed, or record a trainer no-show if the trainer did not arrive.',
    ],
    { label: 'Open the session', url: adminUrl },
    OPS_FOOTER,
  );
  return { to, subject: `Not closed: session ${ctx.sessionCode}`, html, text };
}

export function packageExpiredOpsEmail(to: string, ctx: { packageName: string; unused: number; customer: string }, adminUrl: string): EmailMessage {
  const { html, text } = layout(
    'A package expired with unused sessions',
    [
      `${ctx.customer}'s ${ctx.packageName} package expired with ${ctx.unused} unused session${ctx.unused === 1 ? '' : 's'}.`,
      'Nothing is refunded automatically. If you want to make it right for the customer, you can extend the package or add sessions from its page.',
    ],
    { label: 'Open packages', url: adminUrl },
    OPS_FOOTER,
  );
  return { to, subject: `Package expired with ${ctx.unused} unused session${ctx.unused === 1 ? '' : 's'}`, html, text };
}
