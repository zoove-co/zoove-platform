import type { EmailMessage } from '../email/email.provider';

// Plain, short and branded. The code is the only thing that matters in this email.
export function loginCodeEmail(to: string, code: string, validMinutes: number, audience: 'trainer' | 'admin'): EmailMessage {
  const purpose = audience === 'admin' ? 'sign in to the Zoove admin panel' : 'continue your Zoove trainer application';
  const text = [
    `Your Zoove code is ${code}`,
    '',
    `Use it to ${purpose}. It is valid for ${validMinutes} minutes and works once.`,
    'If you did not ask for this, you can ignore this email. Never share this code with anyone.',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:22px;font-weight:700;margin:0 0 22px;color:#111">zoove<span style="color:#ff5a2c">.</span></p>
<div style="background:#fff;border-radius:12px;padding:26px">
<h1 style="font-size:18px;margin:0 0 8px;color:#111">Your verification code</h1>
<p style="margin:0 0 18px;line-height:1.55;color:#2b2b2b">Use this code to ${purpose}.</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 18px;color:#111">${code}</p>
<p style="margin:0;line-height:1.55;color:#555;font-size:14px">It is valid for ${validMinutes} minutes and works once. If you did not ask for it, ignore this email. Never share this code with anyone.</p>
</div>
<p style="font-size:12px;color:#888;margin:16px 4px">Zoove, Mumbai.</p>
</div></body></html>`;
  return { to, subject: `${code} is your Zoove code`, html, text };
}
