'use client';

import { Gate } from '@/components/Gate';
import { Rewards } from '@/components/Rewards';

export default function Page() {
  return <Gate>{(ctx) => <Rewards {...ctx} />}</Gate>;
}
