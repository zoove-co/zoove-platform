'use client';

import { useEffect, useMemo, useState } from 'react';

import { ApiError, listServices, removeDocument, saveApplication, submitApplication, uploadDocument, type ApplicationView, type SaveBody, type Service } from '@/lib/api';
import { prepareFile } from '@/lib/image';
import { FALLBACK_SERVICES, LANGUAGES, LAST_STEP, STEP_TITLES, stepOfMissing, startingStep } from '@/lib/steps';
import { DocUpload } from './DocUpload';
import { Banner, Field, Progress, Spinner } from './ui';

type Form = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string; // 10 digits, without +91
  email: string;
  addressLine: string;
  addressArea: string;
  addressPincode: string;
  specialties: string[];
  experienceYears: string;
  languages: string[];
  bio: string;
  panNumber: string;
  aadhaarLast4: string;
};

type Errors = Partial<Record<keyof Form, string>>;

// 3 letters, a holder-type letter (P is a person), 1 letter, 4 digits, 1 letter.
const PAN = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;
const GENDERS: [string, string][] = [
  ['female', 'Female'],
  ['male', 'Male'],
  ['other', 'Other'],
  ['prefer_not_to_say', 'Prefer not to say'],
];

function toForm(view: ApplicationView): Form {
  const f = view.form;
  return {
    firstName: f.firstName ?? '',
    lastName: f.lastName ?? '',
    dateOfBirth: f.dateOfBirth ?? '',
    gender: f.gender ?? '',
    phone: (f.phone ?? '').replace(/^\+91/, ''),
    email: f.email ?? '',
    addressLine: f.addressLine ?? '',
    addressArea: f.addressArea ?? '',
    addressPincode: f.addressPincode ?? '',
    specialties: f.specialties,
    experienceYears: f.experienceYears === null ? '' : String(f.experienceYears),
    languages: f.languages,
    bio: f.bio ?? '',
    panNumber: '',
    aadhaarLast4: f.aadhaarLast4 ?? '',
  };
}

function latestAdult(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

function ageOf(dob: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

function pick(all: Errors, key: keyof Form): Errors {
  return { [key]: all[key] } as Errors;
}

function validate(step: number, form: Form, view: ApplicationView): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (!form.firstName.trim()) errors.firstName = 'Enter your first name.';
    if (!form.lastName.trim()) errors.lastName = 'Enter your last name.';
    if (!form.dateOfBirth) errors.dateOfBirth = 'Enter your date of birth.';
    else if (Number.isNaN(Date.parse(form.dateOfBirth))) errors.dateOfBirth = 'That is not a real date.';
    else if (ageOf(form.dateOfBirth) < 18) errors.dateOfBirth = 'You must be at least 18 years old to train with Zoove.';
    if (!form.gender) errors.gender = 'Choose one option.';
    if (form.phone.length !== 10) errors.phone = `A mobile number has 10 digits. You entered ${form.phone.length}.`;
    else if (!/^[6-9]/.test(form.phone)) errors.phone = 'An Indian mobile number starts with 6, 7, 8 or 9.';
    else if (/^(\d)\1{9}$/.test(form.phone)) errors.phone = 'Enter your real mobile number.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  }
  if (step === 1) {
    if (!form.addressLine.trim()) errors.addressLine = 'Enter your flat, building and street.';
    if (!form.addressArea.trim()) errors.addressArea = 'Enter your area or locality.';
    if (!/^[1-9][0-9]{5}$/.test(form.addressPincode)) errors.addressPincode = 'Enter a 6-digit pincode.';
  }
  if (step === 2) {
    if (form.specialties.length === 0) errors.specialties = 'Choose at least one.';
    const years = Number(form.experienceYears);
    if (form.experienceYears === '' || !Number.isInteger(years) || years < 0 || years > 60) errors.experienceYears = 'Enter your years of experience (0 to 60).';
  }
  if (step === 3) {
    const pan = form.panNumber.trim().toUpperCase();
    if (!pan && !view.form.panLast4) errors.panNumber = 'Enter your PAN number.';
    else if (pan && !PAN.test(pan)) errors.panNumber = pan.length !== 10 ? `A PAN has 10 characters. You entered ${pan.length}.` : 'This is not a valid PAN. It looks like ABCPE1234F: 5 letters, 4 digits, 1 letter, and the 4th letter is P for a person.';
    if (!/^[0-9]{4}$/.test(form.aadhaarLast4)) errors.aadhaarLast4 = `Enter exactly 4 digits. You entered ${form.aadhaarLast4.length}.`;
  }
  return errors;
}

function bodyFor(step: number, form: Form, view: ApplicationView): SaveBody {
  if (step === 0) {
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender as NonNullable<SaveBody['gender']>,
      phone: `+91${form.phone}`,
      email: form.email.trim().toLowerCase(),
    };
  }
  if (step === 1) return { addressLine: form.addressLine.trim(), addressArea: form.addressArea.trim(), addressPincode: form.addressPincode };
  if (step === 2) {
    return { specialties: form.specialties, experienceYears: Number(form.experienceYears), languages: form.languages, ...(form.bio.trim() ? { bio: form.bio.trim() } : {}) };
  }
  const body: SaveBody = { aadhaarLast4: form.aadhaarLast4 };
  const pan = form.panNumber.trim().toUpperCase();
  if (pan) body.panNumber = pan;
  void view;
  return body;
}

type Props = { initial: ApplicationView; source: string | null; onChange: (view: ApplicationView) => void; onExpired: () => void };

export function Wizard({ initial, source, onChange, onExpired }: Props) {
  const [view, setView] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [step, setStep] = useState(() => startingStep(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const maxDob = useMemo(latestAdult, []);
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES);
  useEffect(() => {
    void listServices().then((list) => list.length > 0 && setServices(list)).catch(() => undefined);
  }, []);
  const serviceName = (slug: string) => services.find((item) => item.slug === slug)?.name ?? slug;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const toggle = (key: 'specialties' | 'languages', value: string) => set(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);
  const update = (next: ApplicationView) => {
    setView(next);
    onChange(next);
  };

  function failure(err: unknown): void {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return onExpired();
    if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') return setErrors({ email: 'This email is already used by another account.' });
    setProblem(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
  }

  async function next() {
    const found = validate(step, form, view);
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length > 0) return;
    if (step === 4) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const body = bodyFor(step, form, view);
      if (step === 0 && source && !view.id) body.source = source;
      const saved = await saveApplication(body);
      update(saved);
      if (step === 3) setForm((current) => ({ ...current, panNumber: '' }));
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    } catch (err) {
      failure(err);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setProblem(null);
    try {
      update(await submitApplication());
    } catch (err) {
      if (err instanceof ApiError && err.code === 'APPLICATION_INCOMPLETE') {
        const missing = (err.details as { missing?: string[] } | undefined)?.missing ?? [];
        const target = missing.length > 0 ? Math.min(...missing.map(stepOfMissing)) : 0;
        setStep(target);
        setProblem('Something is still missing. We took you to it.');
      } else failure(err);
    } finally {
      setBusy(false);
    }
  }

  const doc = (kind: string) => view.documents.find((item) => item.kind === kind);
  const extras = view.documents.filter((item) => item.kind === 'certificate' || item.kind === 'other');
  const locked = !view.canEdit;
  // While we have asked for changes, only the marked documents (or ones still missing) can be replaced.
  const asked = view.status === 'changes_requested';
  const frozen = (kind: string) => {
    const current = doc(kind);
    return asked && Boolean(current) && current?.status !== 'rejected';
  };
  const hasGoodCertificate = view.documents.some((item) => item.kind === 'certificate' && item.status !== 'rejected');
  const missingDocs = view.missing.filter((key) => key.startsWith('document:'));

  async function addCertificate(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      const prepared = await prepareFile(file, true);
      update(await uploadDocument('certificate', prepared.blob, prepared.name));
    } catch (err) {
      if (err instanceof ApiError) failure(err);
      else setProblem(err instanceof Error ? err.message : 'Could not use this file.');
    } finally {
      setBusy(false);
    }
  }

  async function dropDocument(id: string) {
    setBusy(true);
    try {
      update(await removeDocument(id));
    } catch (err) {
      failure(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Progress step={step} total={STEP_TITLES.length} />
      {view.status === 'changes_requested' ? (
        <Banner tone="warn">
          <b>We need a few changes.</b> {view.reviewNote ?? 'Please check your details and documents, then submit again.'}
        </Banner>
      ) : null}
      <p className="stepcount">Step {step + 1} of {STEP_TITLES.length}</p>
      <h1>{STEP_TITLES[step]}</h1>

      {step === 0 && (
        <>
          <p className="muted">Use your name exactly as it appears on your Aadhaar.</p>
          <div className="row">
            <Field label="First name" error={errors.firstName}>
              <input autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} aria-invalid={Boolean(errors.firstName)} />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <input autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} aria-invalid={Boolean(errors.lastName)} />
            </Field>
          </div>
          <Field label="Date of birth" error={errors.dateOfBirth}>
            <input type="date" max={maxDob} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} aria-invalid={Boolean(errors.dateOfBirth)} />
          </Field>
          <Field label="Gender" error={errors.gender}>
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)} aria-invalid={Boolean(errors.gender)}>
              <option value="">Choose…</option>
              {GENDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mobile number" hint="We will call or message this number about your application." error={errors.phone}>
            <div className="phone">
              <span className="prefix">+91</span>
              <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={() => form.phone && setErrors((cur) => ({ ...cur, ...pick(validate(0, form, view), 'phone') }))} aria-invalid={Boolean(errors.phone)} />
            </div>
          </Field>
          <Field label="Email" hint="We send updates about your application here." error={errors.email}>
            <input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={Boolean(errors.email)} />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <p className="muted">Zoove is starting in Mumbai.</p>
          <Field label="Flat, building, street" error={errors.addressLine}>
            <input autoComplete="address-line1" value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} aria-invalid={Boolean(errors.addressLine)} />
          </Field>
          <Field label="Area or locality" error={errors.addressArea}>
            <input autoComplete="address-line2" value={form.addressArea} onChange={(e) => set('addressArea', e.target.value)} aria-invalid={Boolean(errors.addressArea)} />
          </Field>
          <div className="row">
            <Field label="City">
              <input value={view.form.addressCity} readOnly />
            </Field>
            <Field label="Pincode" error={errors.addressPincode}>
              <input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.addressPincode} onChange={(e) => set('addressPincode', e.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(errors.addressPincode)} />
            </Field>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Field group label="What do you train?" error={errors.specialties}>
            <div className="chips">
              {services.map((item) => (
                <button key={item.slug} type="button" className="chip" aria-pressed={form.specialties.includes(item.slug)} onClick={() => toggle('specialties', item.slug)}>
                  {item.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Years of experience" error={errors.experienceYears}>
            <input type="number" inputMode="numeric" min={0} max={60} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} aria-invalid={Boolean(errors.experienceYears)} />
          </Field>
          <Field group label="Languages you can train in" hint="Optional">
            <div className="chips">
              {LANGUAGES.map((item) => (
                <button key={item} type="button" className="chip" aria-pressed={form.languages.includes(item)} onClick={() => toggle('languages', item)}>
                  {item}
                </button>
              ))}
            </div>
          </Field>
          <Field label="About you" hint="Optional. A line or two about your training style and background (up to 1000 characters).">
            <textarea maxLength={1000} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <p className="muted">We check your identity before anyone is booked with you. These details are stored securely and only the Zoove team can see them.</p>
          <Field
            label="PAN number"
            hint={view.form.panLast4 ? `Already saved (ends ${view.form.panLast4}). Type a new one only if you want to change it.` : 'Ten characters, like ABCPE1234F.'}
            error={errors.panNumber}
          >
            <input autoCapitalize="characters" autoCorrect="off" maxLength={10} value={form.panNumber} placeholder={view.form.panLast4 ? `Saved, ends ${view.form.panLast4}` : 'ABCPE1234F'} onChange={(e) => set('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onBlur={() => form.panNumber && setErrors((cur) => ({ ...cur, ...pick(validate(3, form, view), 'panNumber') }))} aria-invalid={Boolean(errors.panNumber)} />
          </Field>
          <Field label="Last 4 digits of Aadhaar" hint="Only the last 4 digits. We never ask for the full number here." error={errors.aadhaarLast4}>
            <input inputMode="numeric" maxLength={4} value={form.aadhaarLast4} onChange={(e) => set('aadhaarLast4', e.target.value.replace(/\D/g, '').slice(0, 4))} aria-invalid={Boolean(errors.aadhaarLast4)} />
          </Field>
        </>
      )}

      {step === 4 && (
        <>
          {asked ? <Banner tone="warn">The Zoove team asked you to change only the documents marked "Please upload again". The rest are locked.</Banner> : null}
          <p className="muted">Clear photos, all four corners visible. JPG, PNG, WebP or PDF, up to 8 MB.</p>
          <DocUpload kind="aadhaar_front" title="Aadhaar card, front" help="Photo or PDF" doc={doc('aadhaar_front')} frozen={frozen('aadhaar_front')} allowPdf disabled={locked} onUpdated={update} onExpired={onExpired} />
          <DocUpload kind="aadhaar_back" title="Aadhaar card, back" help="Photo or PDF" doc={doc('aadhaar_back')} frozen={frozen('aadhaar_back')} allowPdf disabled={locked} onUpdated={update} onExpired={onExpired} />
          <DocUpload kind="pan_card" title="PAN card" help="Photo or PDF" doc={doc('pan_card')} frozen={frozen('pan_card')} allowPdf disabled={locked} onUpdated={update} onExpired={onExpired} />
          <DocUpload kind="selfie" title="Selfie" help="Taken now with your camera" doc={doc('selfie')} frozen={frozen('selfie')} allowPdf={false} live disabled={locked} onUpdated={update} onExpired={onExpired} />
          <h2 style={{ marginTop: 22 }}>Certificates</h2>
          <p className="muted small">Add at least one yoga, fitness or other training certificate. It is required.</p>
          {extras.map((item) => (
            <div className="doc" key={item.id}>
              <div className="tick ok" aria-hidden>
                ✓
              </div>
              <div className="meta">
                <div className="name">Certificate</div>
                <div className={`state ${item.status === 'rejected' ? 'bad' : 'ok'}`}>{item.status === 'rejected' ? `Please upload again${item.note ? `: ${item.note}` : ''}` : 'Uploaded'}</div>
              </div>
              <button className="btn small ghost" type="button" disabled={busy || locked || (asked && item.status !== 'rejected')} onClick={() => void dropDocument(item.id)}>
                Remove
              </button>
            </div>
          ))}
          {extras.length < 10 && !(asked && hasGoodCertificate) ? (
            <label className="btn secondary small" style={{ cursor: 'pointer' }}>
              Add a certificate
              <input
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={busy || locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void addCertificate(file);
                }}
              />
            </label>
          ) : null}
          {missingDocs.length > 0 ? <p className="muted small" style={{ marginTop: 14 }}>Upload the four documents and at least one certificate to continue.</p> : null}
        </>
      )}

      {step === 5 && (
        <>
          <p className="muted">Check everything once. You can change it until you submit.</p>
          <Summary title="About you" onEdit={() => setStep(0)} rows={[['Name', `${form.firstName} ${form.lastName}`], ['Date of birth', form.dateOfBirth], ['Mobile', `+91 ${form.phone}`], ['Email', form.email]]} />
          <Summary title="Address" onEdit={() => setStep(1)} rows={[['Address', `${form.addressLine}, ${form.addressArea}`], ['City', `${view.form.addressCity} ${form.addressPincode}`]]} />
          <Summary title="Experience" onEdit={() => setStep(2)} rows={[['Trains', form.specialties.map(serviceName).join(', ')], ['Experience', `${form.experienceYears} years`], ['Languages', form.languages.join(', ') || '—']]} />
          <Summary title="ID" onEdit={() => setStep(3)} rows={[['PAN', view.form.panLast4 ? `Ends ${view.form.panLast4}` : '—'], ['Aadhaar', `Ends ${form.aadhaarLast4}`]]} />
          <Summary title="Documents" onEdit={() => setStep(4)} rows={[['Uploaded', `${view.documents.filter((item) => item.status !== 'rejected').length} file(s)`]]} />
          {view.missing.length > 0 ? <Banner tone="warn">Still missing: please finish the earlier steps. Use the Edit links above.</Banner> : null}
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            <span>I confirm these details are true and I agree to Zoove&apos;s terms and privacy policy.</span>
          </label>
        </>
      )}

      {problem ? <Banner tone="bad">{problem}</Banner> : null}

      <div className="stickybar">
        <div className="inner">
          {step > 0 ? (
            <button className="btn ghost" type="button" style={{ flex: 0.5 }} disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : null}
          {step < LAST_STEP ? (
            <button className="btn" type="button" disabled={busy || (step === 4 && missingDocs.length > 0)} onClick={() => void next()}>
              {busy ? <Spinner /> : null} {step === 3 ? 'Save and continue' : 'Continue'}
            </button>
          ) : (
            <button className="btn" type="button" disabled={busy || !agree || !view.canSubmit} onClick={() => void submit()}>
              {busy ? <Spinner /> : null} Submit application
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Summary({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <div className="card summary">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="linkbtn" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      <dl style={{ marginTop: 8 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
