'use client';

import { Gate } from '@/components/Gate';
import { Dashboard } from '@/components/Dashboard';

// The same page as Trainers, opened on "Detail changes" (the link in emails and on Needs attention lands here).
export default function Page() {
  return <Gate>{(ctx) => <Dashboard {...ctx} initialView="requests" />}</Gate>;
}
