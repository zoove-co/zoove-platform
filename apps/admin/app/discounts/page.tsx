'use client';

import { Discounts } from '@/components/Discounts';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Discounts {...ctx} />}</Gate>;
}
