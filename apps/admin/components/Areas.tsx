'use client';

import { useCallback, useEffect, useState } from 'react';

import { addAreaPincode, ApiError, createArea, listAreas, removeAreaPincode, renameArea, setAreaActive, type AdminArea } from '@/lib/api';
import { Shell } from './Shell';
import { Banner, Field, Spinner } from './ui';

const PIN = /^[1-9][0-9]{5}$/;

export function Areas({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const [areas, setAreas] = useState<AdminArea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPin, setNewPin] = useState<Record<string, string>>({});
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [off, setOff] = useState<AdminArea | null>(null);
  const [form, setForm] = useState<{ name: string; city: string; pins: string; active: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handle = useCallback((err: unknown): string => {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') { expired(); return ''; }
    return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
  }, [expired]);

  const load = useCallback(async () => {
    try { setAreas(await listAreas()); setError(null); } catch (err) { setError(handle(err)); }
  }, [handle]);
  useEffect(() => { void load(); }, [load]);

  async function run(message: string, work: () => Promise<AdminArea[] | { id: string }>): Promise<boolean> {
    setBusy(true); setError(null); setSaved(null);
    try {
      const result = await work();
      if (Array.isArray(result)) setAreas(result); else await load();
      setSaved(message);
      return true;
    } catch (err) {
      const text = handle(err);
      setError(text); setFormError(text);
      return false;
    } finally { setBusy(false); }
  }

  const addPin = async (a: AdminArea) => {
    const pin = (newPin[a.id] ?? '').trim();
    if (!PIN.test(pin)) return setError('A pincode has 6 digits.');
    if (await run(`Pincode ${pin} added to ${a.name}`, () => addAreaPincode(a.id, pin))) setNewPin({ ...newPin, [a.id]: '' });
  };

  const storeArea = async () => {
    if (!form) return;
    setFormError(null);
    const pincodes = form.pins.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    if (form.name.trim().length < 2) return setFormError('Enter a name for the area.');
    if (pincodes.some((p) => !PIN.test(p))) return setFormError('Every pincode must have 6 digits.');
    if (await run(`${form.name.trim()} added`, () => createArea({ name: form.name.trim(), city: form.city.trim() || 'Mumbai', pincodes, active: form.active }))) setForm(null);
  };

  const open = (areas ?? []).filter((a) => a.status === 'active');

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Areas</h1>
          <p>Where customers can book. A customer can book only if their pincode is in an area that is open. Switching an area off stops new bookings there; sessions already booked are not cancelled. Trainers are alerted by pincode first, then by area.</p>
        </div>
        <button className="btn" type="button" onClick={() => { setFormError(null); setForm({ name: '', city: 'Mumbai', pins: '', active: false }); }}>New area</button>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {saved && !error ? <Banner tone="good">{saved}.</Banner> : null}
      {!areas && !error ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : null}

      {areas ? (
        <>
          <p className="muted small">{open.length} of {areas.length} areas open · {open.reduce((n, a) => n + a.pincodes.length, 0)} pincodes can book.</p>
          {areas.map((a) => (
            <section key={a.id} className="panel" style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{a.name} <span className={`pill ${a.status === 'active' ? 'approved' : 'rejected'}`}>{a.status === 'active' ? 'Open' : 'Off'}</span></h2>
                  <div className="muted small">{a.city} · {a.trainerCount === 0 ? 'no trainers live here yet' : `${a.trainerCount} trainer${a.trainerCount === 1 ? '' : 's'} live here`}{a.status === 'active' && a.trainerCount === 0 ? ' · a booking here waits for a trainer from another area' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setRename({ id: a.id, name: a.name })}>Rename</button>
                  {a.status === 'active'
                    ? <button className="btn ghost" type="button" disabled={busy} onClick={() => setOff(a)}>Switch off</button>
                    : <button className="btn" type="button" disabled={busy || a.pincodes.length === 0} title={a.pincodes.length === 0 ? 'Add a pincode first' : undefined} onClick={() => void run(`${a.name} is open`, () => setAreaActive(a.id, true))}>Open for bookings</button>}
                </div>
              </div>

              <h3 style={{ marginBottom: 6 }}>Pincodes</h3>
              {a.pincodes.length === 0 ? <p className="muted small" style={{ marginTop: 0 }}>No pincodes yet.</p> : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {a.pincodes.map((pin) => (
                    <span key={pin} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {pin}
                      <button type="button" aria-label={`Remove ${pin}`} title="Remove" disabled={busy} onClick={() => void run(`Pincode ${pin} removed`, () => removeAreaPincode(a.id, pin))} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
                <input inputMode="numeric" maxLength={6} placeholder="Add a pincode, e.g. 400050" value={newPin[a.id] ?? ''} onChange={(e) => setNewPin({ ...newPin, [a.id]: e.target.value.replace(/\D/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter') void addPin(a); }} />
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void addPin(a)}>Add</button>
              </div>
            </section>
          ))}
        </>
      ) : null}

      {form ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>New area</h2>
            <div className="fields">
              <Field label="Name" hint="For example Bandra West."><input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="City"><input value={form.city} maxLength={40} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Pincodes" hint="Separate with commas or spaces. A pincode can be in only one area."><input className="full" value={form.pins} onChange={(e) => setForm({ ...form, pins: e.target.value })} /></Field>
              <Field label="Open for bookings now">
                <select value={form.active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}><option value="no">No, add it switched off</option><option value="yes">Yes, open it now</option></select>
              </Field>
            </div>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void storeArea()}>{busy ? <Spinner /> : null} Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {rename ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Rename area</h2>
            <div className="fields"><Field label="Name"><input value={rename.name} maxLength={60} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field></div>
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setRename(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy || rename.name.trim().length < 2} onClick={async () => { if (await run('Area renamed', () => renameArea(rename.id, rename.name.trim()))) setRename(null); }}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {off ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Switch off {off.name}?</h2>
            <p className="muted">Customers in these pincodes ({off.pincodes.join(', ') || 'none'}) will no longer be able to book. Sessions already booked stay as they are. You can open it again at any time.</p>
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOff(null)}>Keep it open</button>
              <button className="btn" type="button" disabled={busy} onClick={async () => { if (await run(`${off.name} is off`, () => setAreaActive(off.id, false))) setOff(null); }}>Switch off</button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
