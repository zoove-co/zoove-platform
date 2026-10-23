'use client';

import { Gate } from '@/components/Gate';
import { Team } from '@/components/Team';

export default function Page() {
  return <Gate>{(ctx) => <Team {...ctx} />}</Gate>;
}
