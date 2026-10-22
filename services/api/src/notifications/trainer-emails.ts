import type { EmailMessage } from '../email/email.provider';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }): { html: string; text: string } {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#2b2b2b">${escape(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:22px 0"><a href="${escape(action.url)}" style="background:#ff5a2c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escape(action.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:22px;font-weight:700;margin:0 0 22px;color:#111">zoove<span style="color:#ff5a2c">.</span></p>
<div style="background:#fff;border-radius:12px;padding:26px">
<h1 style="font-size:20px;margin:0 0 16px;color:#111">${escape(heading)}</h1>${body}${button}</div>
<p style="font-size:12px;color:#888;margin:16px 4px">Zoove, Mumbai. You received this because you applied to train with Zoove.</p>
</div></body></html>`;
  const text = [heading, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n');
  return { html, text };
}

export type TrainerMailContext = { firstName: string; statusUrl: string; note?: string | null };

export function receivedEmail(to: string, ctx: TrainerMailContext, resubmission: boolean): EmailMessage {
  const { html, text } = layout(
    resubmission ? 'We got your updates' : 'We received your application',
    [`Hi ${ctx.firstName},`, resubmission ? 'Thanks for sending the changes. Our team will review them again and email you the result.' : 'Thanks for applying to train with Zoove. Our team is checking your details and documents. This usually takes a short while, and we will email you as soon as there is an update.'],
    { label: 'See your application status', url: ctx.statusUrl },
  );
  return { to, subject: resubmission ? 'We got your updates' : 'We received your Zoove trainer application', html, text };
}

export function changesEmail(to: string, ctx: TrainerMailContext): EmailMessage {
  const { html, text } = layout(
    'We need a little more from you',
    [`Hi ${ctx.firstName},`, 'Our team reviewed your application and needs something fixed or added before we can approve it:', ctx.note ?? '', 'Open your application, make the change, and submit again.'],
    { label: 'Update your application', url: ctx.statusUrl },
  );
  return { to, subject: 'Action needed on your Zoove trainer application', html, text };
}

export function approvedEmail(to: string, ctx: TrainerMailContext): EmailMessage {
  const { html, text } = layout(
    'You are approved',
    [`Hi ${ctx.firstName},`, 'Welcome to Zoove. Your KYC is approved and you are now part of our trainer network. We will contact you with the next steps, including when the trainer app is ready.'],
    { label: 'View your profile status', url: ctx.statusUrl },
  );
  return { to, subject: 'Welcome to Zoove, you are approved', html, text };
}

export function rejectedEmail(to: string, ctx: TrainerMailContext): EmailMessage {
  const { html, text } = layout('About your application', [`Hi ${ctx.firstName},`, 'Thank you for applying to train with Zoove. After reviewing your application we are not able to approve it right now.', ctx.note ?? '', 'If you think this is a mistake, reply to this email and we will look again.']);
  return { to, subject: 'Your Zoove trainer application', html, text };
}

export function opsNewApplicationEmail(to: string, name: string, phone: string, adminUrl: string, resubmission: boolean): EmailMessage {
  const { html, text } = layout(
    resubmission ? 'Trainer re-submitted' : 'New trainer application',
    [`${name} (${phone}) ${resubmission ? 'sent changes and is waiting for review again.' : 'submitted a KYC application and is waiting for review.'}`],
    { label: 'Open in admin', url: adminUrl },
  );
  return { to, subject: `${resubmission ? 'Re-submitted' : 'New'} trainer application: ${name}`, html, text };
}
