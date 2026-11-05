'use client';

import { Gate } from '@/components/Gate';
import { Offerings } from '@/components/Offerings';

export default function Page() {
  return <Gate>{(ctx) => <Offerings {...ctx} />}</Gate>;
}
