'use client';

import { Gate } from '@/components/Gate';
import { Detail } from '@/components/Detail';

export default function Page() {
  return <Gate>{(ctx) => <Detail {...ctx} />}</Gate>;
}
