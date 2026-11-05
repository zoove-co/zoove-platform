'use client';

import { Gate } from '@/components/Gate';
import { Sessions } from '@/components/Sessions';

export default function Page() {
  return <Gate>{(ctx) => <Sessions {...ctx} />}</Gate>;
}
