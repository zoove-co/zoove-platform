import type { EmailMessage } from '../email/email.provider';
import { layout } from './trainer-emails';

export type JobMailContext = { firstName: string; sessionCode: string; serviceName: string; when: string; area: string };

const FOOTER = 'You received this because you are a Zoove trainer.';

// Sent to a trainer when ops put them on a session. The address and customer details are on the jobs page, not in the email.
export function jobAssignedEmail(to: string, ctx: JobMailContext, jobsUrl: string): EmailMessage {
  const { html, text } = layout(
    `You have a new session: ${ctx.sessionCode}`,
    [
      `Hi ${ctx.firstName},`,
      `Our team assigned you to a ${ctx.serviceName} session on ${ctx.when}${ctx.area ? ` in ${ctx.area}` : ''}.`,
      'Open your jobs page to see the full address and details. If you cannot make it, cancel it there as early as you can, so we can find someone else for the customer.',
    ],
    { label: 'Open my jobs', url: jobsUrl },
    FOOTER,
  );
  return { to, subject: `New session for you: ${ctx.serviceName}, ${ctx.when}`, html, text };
}

// Sent when ops move a session the trainer already holds to another time.
export function jobMovedEmail(to: string, ctx: JobMailContext, jobsUrl: string): EmailMessage {
  const { html, text } = layout(
    `Session ${ctx.sessionCode} was moved`,
    [
      `Hi ${ctx.firstName},`,
      `Our team moved your ${ctx.serviceName} session ${ctx.sessionCode}. The new time is ${ctx.when}${ctx.area ? ` in ${ctx.area}` : ''}.`,
      'If you cannot make the new time, cancel it on your jobs page so we can find someone else.',
    ],
    { label: 'Open my jobs', url: jobsUrl },
    FOOTER,
  );
  return { to, subject: `Session moved: ${ctx.serviceName}, now ${ctx.when}`, html, text };
}
