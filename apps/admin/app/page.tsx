'use client';

import { Gate } from '@/components/Gate';
import { Dashboard } from '@/components/Dashboard';

export default function Page() {
  return <Gate>{(ctx) => <Dashboard {...ctx} />}</Gate>;
}
