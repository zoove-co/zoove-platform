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

// Sent to trainers near an open session, nearest first. It is first come, first served on the jobs page.
export function jobAvailableEmail(to: string, ctx: JobMailContext, jobsUrl: string): EmailMessage {
  const { html, text } = layout(
    `New session you can take: ${ctx.sessionCode}`,
    [
      `Hi ${ctx.firstName},`,
      `A customer needs a ${ctx.serviceName} session ${ctx.when === 'as soon as possible' ? 'as soon as possible' : `on ${ctx.when}`}${ctx.area ? ` in ${ctx.area}` : ''}.`,
      'It goes to the first trainer who accepts it on the jobs page. If someone else gets there first, the job will no longer be listed.',
    ],
    { label: 'See the job', url: jobsUrl },
    FOOTER,
  );
  return { to, subject: `New ${ctx.serviceName} session${ctx.area ? ` in ${ctx.area}` : ''}: ${ctx.when}`, html, text };
}

// Sent to a trainer when a session they hold is no longer theirs: the customer cancelled it, or moved it to a time they are busy.
export function jobCancelledEmail(to: string, ctx: JobMailContext & { reason?: string }, jobsUrl: string): EmailMessage {
  const moved = ctx.reason === 'moved';
  const { html, text } = layout(
    moved ? `Session ${ctx.sessionCode} is no longer yours` : `Session ${ctx.sessionCode} was cancelled`,
    [
      `Hi ${ctx.firstName},`,
      moved
        ? `The customer moved the ${ctx.serviceName} session ${ctx.sessionCode} to ${ctx.when}, a time you already have another session. It has been taken off your list and we are finding another trainer.`
        : `The customer cancelled the ${ctx.serviceName} session ${ctx.sessionCode}${ctx.when ? ` that was planned for ${ctx.when}` : ''}${ctx.area ? ` in ${ctx.area}` : ''}. Please do not travel for it.`,
      'You do not need to do anything. It has been removed from your jobs page.',
    ],
    { label: 'Open my jobs', url: jobsUrl },
    FOOTER,
  );
  return { to, subject: moved ? `Removed from your list: session ${ctx.sessionCode}` : `Cancelled: ${ctx.serviceName}, ${ctx.when}`, html, text };
}

// Sent 30 minutes before a session the trainer holds. The address is in the app, not in the email.
export function sessionReminderEmail(to: string, ctx: JobMailContext & { minutes: number }, jobsUrl: string): EmailMessage {
  const { html, text } = layout(
    `Your session starts in about ${ctx.minutes} minutes`,
    [
      `Hi ${ctx.firstName},`,
      `Your ${ctx.serviceName} session ${ctx.sessionCode} starts at ${ctx.when}${ctx.area ? ` in ${ctx.area}` : ''}.`,
      'Open the app to see the address and the customer. If something has come up, cancel the session there right away so we can look for someone else.',
    ],
    { label: 'Open my sessions', url: jobsUrl },
    FOOTER,
  );
  return { to, subject: `Starts in about ${ctx.minutes} minutes: ${ctx.serviceName}, ${ctx.when}`, html, text };
}
