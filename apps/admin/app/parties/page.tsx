'use client';

import { Gate } from '@/components/Gate';
import { Parties } from '@/components/Parties';

export default function Page() {
  return <Gate>{(ctx) => <Parties {...ctx} />}</Gate>;
}
