'use client';

import { Gate } from '@/components/Gate';
import { TrainerRequests } from '@/components/TrainerRequests';

export default function Page() {
  return <Gate>{(ctx) => <TrainerRequests {...ctx} />}</Gate>;
}
