'use client';

import { Economics } from '@/components/Economics';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Economics {...ctx} />}</Gate>;
}
