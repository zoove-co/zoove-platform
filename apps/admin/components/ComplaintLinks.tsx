'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { complaintsForPerson, complaintsForSession, type ComplaintLink, type ComplaintStatus } from '@/lib/api';
import { can, useMe } from './me';

const STATUS_LABEL: Record<ComplaintStatus, string> = { open: 'waiting for us', waiting_on_user: 'waiting for them', resolved: 'resolved' };

// On a session or a customer: the complaints raised about it, each opening in the Complaints page. Nothing shows when there are none,
// or when this admin may not handle complaints.
export function ComplaintLinks({ kind, id }: { kind: 'session' | 'person'; id: string }) {
  const me = useMe();
  const [items, setItems] = useState<ComplaintLink[]>([]);
  const allowed = can(me, 'complaints.customers') || can(me, 'complaints.trainers');
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    (kind === 'session' ? complaintsForSession(id) : complaintsForPerson(id)).then((rows) => { if (live) setItems(rows); }).catch(() => undefined);
    return () => { live = false; };
  }, [allowed, kind, id]);
  if (!allowed || items.length === 0) return null;
  return (
    <>
      <h3>Complaints</h3>
      <ul className="accesslist" style={{ marginTop: 0 }}>
        {items.map((c) => (
          <li key={c.id}><Link href={`/complaints?id=${c.id}`}>{c.code}</Link> · {c.side === 'trainer' ? 'from the trainer' : 'from the customer'} · {c.subject} · {STATUS_LABEL[c.status]}</li>
        ))}
      </ul>
    </>
  );
}
