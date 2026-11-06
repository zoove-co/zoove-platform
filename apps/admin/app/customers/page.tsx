'use client';

import { Customers } from '@/components/Customers';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Customers {...ctx} />}</Gate>;
}
