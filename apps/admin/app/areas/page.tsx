'use client';

import { Areas } from '@/components/Areas';
import { Gate } from '@/components/Gate';

export default function Page() {
  return <Gate>{(ctx) => <Areas {...ctx} />}</Gate>;
}
