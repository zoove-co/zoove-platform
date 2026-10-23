'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, addMember, listTeam, updateMember, type Member, type PermissionInfo } from '@/lib/api';
import { useMe } from './me';
import { Shell } from './Shell';
import { Banner, Field, Spinner, avatarTone, initials } from './ui';

type Draft = { name: string; email: string; jobTitle: string; reportsTo: string; isOwner: boolean; active: boolean; permissions: string[] };
const EMPTY: Draft = { name: '', email: '', jobTitle: '', reportsTo: '', isOwner: false, active: true, permissions: [] };

const SUGGESTED_ROLES = ['Operations', 'Support', 'Trainer relations'];

const signedIn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Not yet';

export function Team({ signOut, expired }: { signOut: () => void; expired: () => void }) {
  const me = useMe();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handle = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') {
        expired();
        return '';
      }
      return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    },
    [expired],
  );

  const load = useCallback(async () => {
    try {
      const data = await listTeam();
      setMembers(data.members);
      setCatalog(data.permissions);
      setError(null);
    } catch (err) {
      setError(handle(err) || null);
    }
  }, [handle]);

  useEffect(() => {
    if (me && !me.isOwner) return;
    void load();
  }, [load, me]);

  if (me && !me.isOwner) {
    return (
      <Shell signOut={signOut}>
        <div className="pagehead"><div><h1>Team</h1></div></div>
        <Banner tone="info">Only owners can manage the team.</Banner>
      </Shell>
    );
  }

  const openNew = () => {
    setDraft(EMPTY);
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (member: Member) => {
    setDraft({ name: member.name, email: member.email ?? '', jobTitle: member.jobTitle, reportsTo: member.reportsTo?.id ?? '', isOwner: member.isOwner, active: member.active, permissions: member.permissions });
    setFormError(null);
    setEditing(member);
  };
  // Acting on trainers needs seeing them first (the API enforces this too): turning those on turns "view" on, turning "view" off turns them off.
  const toggle = (key: string) =>
    setDraft((cur) => {
      const on = !cur.permissions.includes(key);
      let next = on ? [...cur.permissions, key] : cur.permissions.filter((k) => k !== key);
      if (on && (key === 'trainers.documents' || key === 'trainers.decide') && !next.includes('trainers.view')) next = [...next, 'trainers.view'];
      if (!on && key === 'trainers.view') next = next.filter((k) => k !== 'trainers.documents' && k !== 'trainers.decide');
      return { ...cur, permissions: next };
    });

  async function save() {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    try {
      const body = { name: draft.name.trim(), jobTitle: draft.jobTitle.trim(), reportsTo: draft.reportsTo || null, permissions: draft.permissions, isOwner: draft.isOwner };
      if (editing === 'new') {
        await addMember({ ...body, email: draft.email.trim() });
        setNotice(`${body.name} was added. We emailed an invite to ${draft.email.trim().toLowerCase()}.`);
      } else {
        await updateMember(editing.id, { ...body, active: draft.active });
        setNotice(`${body.name} was updated.`);
      }
      setEditing(null);
      await load();
    } catch (err) {
      const message = handle(err);
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  const groups = catalog.reduce<Record<string, PermissionInfo[]>>((acc, item) => ((acc[item.group] ??= []).push(item), acc), {});
  const canSave = draft.name.trim().length >= 2 && draft.jobTitle.trim().length >= 2 && (editing !== 'new' || /^\S+@\S+\.\S+$/.test(draft.email.trim()));
  const others = (members ?? []).filter((member) => editing === 'new' || member.id !== (editing as Member | null)?.id);

  return (
    <Shell signOut={signOut}>
      <div className="pagehead">
        <div>
          <h1>Team</h1>
          <p>People who can sign in to this admin. Owners decide each person&apos;s role and what they can do.</p>
        </div>
        <button className="btn" type="button" onClick={openNew}>Add member</button>
      </div>

      {notice ? <Banner tone="good">{notice}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      {!members && !error ? (
        <div className="center" style={{ padding: 40 }}><Spinner /></div>
      ) : members ? (
        <div className="panel tablewrap">
          <table className="list">
            <thead>
              <tr><th>Member</th><th>Role</th><th className="hide-sm">Reports to</th><th>Access</th><th className="hide-sm">Last sign-in</th><th>Status</th></tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} onClick={() => openEdit(member)}>
                  <td>
                    <div className="person">
                      <span className={`avatar ${avatarTone(member.name)}`}>{initials(member.name)}</span>
                      <span className="who"><b>{member.name}</b><span className="sub">{member.email ?? ''}</span></span>
                    </div>
                  </td>
                  <td>{member.jobTitle}{member.isOwner && member.jobTitle.trim().toLowerCase() !== 'owner' ? <span className="tag-chip" style={{ marginLeft: 8 }}>Owner</span> : null}</td>
                  <td className="hide-sm muted">{member.reportsTo?.name ?? '—'}</td>
                  <td>{member.isOwner ? 'Full access' : `${member.permissions.length} of ${catalog.length || '–'}`}</td>
                  <td className="hide-sm muted">{signedIn(member.lastLoginAt)}</td>
                  <td><span className={`pill ${member.active ? 'approved' : 'rejected'}`}>{member.active ? 'Active' : 'Switched off'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editing ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet wide">
            <h2>{editing === 'new' ? 'Add a team member' : `Edit ${editing.name}`}</h2>
            <p className="muted">
              {editing === 'new' ? 'They get an email and sign in with a one-time code sent to that address. No password.' : 'Changes take effect on their very next click.'}
            </p>
            <Field label="Full name"><input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Email" hint={editing === 'new' ? 'The invite and the sign-in codes go here.' : 'The email cannot be changed.'}>
              <input type="email" value={draft.email} disabled={editing !== 'new'} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="Role" hint="Any title you like. You can change it later.">
              <input list="role-suggestions" value={draft.jobTitle} maxLength={60} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
              <datalist id="role-suggestions">{SUGGESTED_ROLES.map((role) => <option key={role} value={role} />)}</datalist>
            </Field>
            <Field label="Reports to">
              <select value={draft.reportsTo} onChange={(e) => setDraft({ ...draft, reportsTo: e.target.value })}>
                <option value="">No one</option>
                {others.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </Field>

            <div className="switches">
              <label className="sw">
                <span className="t"><b>Owner</b><small>Full access, and can manage the team.</small></span>
                <input type="checkbox" role="switch" checked={draft.isOwner} onChange={(e) => setDraft({ ...draft, isOwner: e.target.checked })} />
              </label>
            </div>

            <p className="small" style={{ margin: '18px 0 2px' }}><b>What they can do</b></p>
            {Object.entries(groups).map(([group, items]) => (
              <div className="switches" key={group}>
                <div className="grouphead">{group}</div>
                {items.map((item) => (
                  <label className="sw" key={item.key}>
                    <span className="t"><b>{item.label}{item.soon ? <span className="soontag inline">Soon</span> : null}</b><small>{item.hint}</small></span>
                    <input type="checkbox" role="switch" disabled={draft.isOwner} checked={draft.isOwner || draft.permissions.includes(item.key)} onChange={() => toggle(item.key)} />
                  </label>
                ))}
              </div>
            ))}

            {editing !== 'new' ? (
              <div className="switches">
                <label className="sw">
                  <span className="t"><b>Can sign in</b><small>Turn off to block them straight away. Nothing is deleted.</small></span>
                  <input type="checkbox" role="switch" disabled={editing.id === me?.id} checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                </label>
              </div>
            ) : null}

            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <div className="actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy || !canSave} onClick={() => void save()}>
                {busy ? <Spinner /> : null} {editing === 'new' ? 'Add and send invite' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
