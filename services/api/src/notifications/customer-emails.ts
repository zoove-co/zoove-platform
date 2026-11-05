import type { EmailMessage } from '../email/email.provider';
import { layout } from './trainer-emails';

export type RewardMailContext = { side: 'referrer' | 'friend'; code: string; worth: string; until: string };

// Sent to a customer when a referral reward code is made for them. The code is also shown in the app (Refer a friend).
export function referralRewardEmail(to: string, ctx: RewardMailContext): EmailMessage {
  const intro = ctx.side === 'referrer' ? 'Your friend just made their first booking with Zoove, thank you for sharing.' : 'Welcome to Zoove. Here is a thank-you for joining through a friend.';
  const { html, text } = layout(
    ctx.side === 'referrer' ? 'You earned a referral reward' : 'Your welcome reward',
    [
      intro,
      `Your code is ${ctx.code}. It gives you ${ctx.worth} on one session.`,
      `It works once and is valid until ${ctx.until}. Enter it at checkout when you book. You can also find it in the app under Refer a friend.`,
    ],
    undefined,
    'You received this because of a Zoove referral.',
  );
  return { to, subject: ctx.side === 'referrer' ? `Your Zoove reward: ${ctx.worth}` : `Welcome to Zoove: ${ctx.worth} for you`, html, text };
}
