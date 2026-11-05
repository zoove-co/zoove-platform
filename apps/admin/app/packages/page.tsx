'use client';

import { Gate } from '@/components/Gate';
import { Packages } from '@/components/Packages';

export default function Page() {
  return <Gate>{(ctx) => <Packages {...ctx} />}</Gate>;
}
