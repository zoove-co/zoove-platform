'use client';

import { Complaints } from '@/components/Complaints';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Complaints {...ctx} />}</Gate>;
}
