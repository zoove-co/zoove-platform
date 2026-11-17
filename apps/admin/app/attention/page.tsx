'use client';

import { Attention } from '@/components/Attention';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Attention {...ctx} />}</Gate>;
}
