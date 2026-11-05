import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { ApiError, listServices, removeDocument, saveApplication, submitApplication, uploadDocument, type ApplicationView, type DocumentKind, type Service } from '@/lib/api';
import {
  bodyFor, FALLBACK_SERVICES, formatDobTyping, GENDERS, LANGUAGES, LAST_STEP, startingStep, stepOfMissing, STEP_TITLES, toForm, validate, type Errors, type Form,
} from '@/lib/application';
import { pickFile, type FileSource } from '@/lib/files';
import { APPLICATION_KEY } from '@/lib/useApplication';
import { colors, radius } from '@/theme';

import { DocumentRow } from './DocumentRow';

// The six-step application. It saves to the server after every step, so a trainer can stop here and finish on the Join Zoove page
// (or the other way round): both read and write the same application.
export function Wizard({ initial }: { initial: ApplicationView }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [step, setStep] = useState(() => startingStep(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES);

  useEffect(() => {
    void listServices().then((list) => list.length > 0 && setServices(list)).catch(() => undefined);
  }, []);
  // The phone's back button goes to the previous step before it leaves the application.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      setStep(step - 1);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  const serviceName = (slug: string) => services.find((item) => item.slug === slug)?.name ?? slug;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const toggle = (key: 'specialties' | 'languages', value: string) => set(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);
  const update = (next: ApplicationView) => {
    setView(next);
    queryClient.setQueryData(APPLICATION_KEY, next);
  };

  function failure(err: unknown): void {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return; // the app signs the trainer out and explains
    if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') return setErrors({ email: 'This email is already used by another account.' });
    setProblem(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong. Please try again.');
  }

  async function next() {
    const found = validate(step, form, view);
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length > 0) return;
    if (step === 4) return setStep(step + 1);
    setBusy(true);
    try {
      const saved = await saveApplication(bodyFor(step, form));
      update(saved);
      if (step === 3) setForm((current) => ({ ...current, panNumber: '' }));
      setStep(step + 1);
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
      update(await submitApplication()); // the screen then moves to "Application received"
    } catch (err) {
      if (err instanceof ApiError && err.code === 'APPLICATION_INCOMPLETE') {
        const missing = (err.details as { missing?: string[] } | undefined)?.missing ?? [];
        setStep(missing.length > 0 ? Math.min(...missing.map(stepOfMissing)) : 0);
        setProblem('Something is still missing. We took you to it.');
      } else failure(err);
    } finally {
      setBusy(false);
    }
  }

  async function addDocument(kind: DocumentKind, source: FileSource) {
    setProblem(null);
    setUploading(kind);
    try {
      const file = await pickFile(source, { front: kind === 'selfie' });
      if (file) update(await uploadDocument(kind, file));
    } catch (err) {
      failure(err);
    } finally {
      setUploading(null);
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

  function addCertificate() {
    Alert.alert('Add a certificate', 'A yoga, fitness or other training certificate.', [
      { text: 'Take a photo', onPress: () => void addDocument('certificate', 'camera') },
      { text: 'Choose from gallery', onPress: () => void addDocument('certificate', 'library') },
      { text: 'Choose a PDF', onPress: () => void addDocument('certificate', 'pdf') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const doc = (kind: DocumentKind) => view.documents.find((item) => item.kind === kind);
  const extras = view.documents.filter((item) => item.kind === 'certificate' || item.kind === 'other');
  const locked = !view.canEdit;
  // While the team has asked for changes, only the marked documents (or ones still missing) can be replaced.
  const asked = view.status === 'changes_requested';
  const frozen = (kind: DocumentKind) => asked && Boolean(doc(kind)) && doc(kind)?.status !== 'rejected';
  const hasGoodCertificate = view.documents.some((item) => item.kind === 'certificate' && item.status !== 'rejected');
  const missingDocs = view.missing.filter((key) => key.startsWith('document:'));
  const anyBusy = busy || uploading !== null;

  const footer = (
    <>
      {step > 0 ? <View style={{ flex: 0.6 }}><Button label="Back" variant="soft" disabled={anyBusy} onPress={() => setStep(step - 1)} /></View> : null}
      <View style={{ flex: 1 }}>
        {step < LAST_STEP ? (
          <Button label={step === 3 ? 'Save and continue' : 'Continue'} loading={busy} disabled={uploading !== null || (step === 4 && missingDocs.length > 0)} onPress={() => void next()} />
        ) : (
          <Button label="Submit application" loading={busy} disabled={!agree || !view.canSubmit} onPress={() => void submit()} />
        )}
      </View>
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEP_TITLES.map((title, index) => (
          <View key={title} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index <= step ? colors.purple : colors.lavender }} />
        ))}
      </View>
      {asked ? <Banner tone="warn">{`We need a few changes. ${view.reviewNote ?? 'Please check your details and documents, then submit again.'}`}</Banner> : null}
      <View style={{ gap: 4 }}>
        <AppText variant="eyebrow" color={colors.muted}>{`STEP ${step + 1} OF ${STEP_TITLES.length}`}</AppText>
        <AppText variant="screenTitle">{STEP_TITLES[step] ?? ''}</AppText>
      </View>

      {step === 0 && (
        <View style={{ gap: 14 }}>
          <AppText variant="body" color={colors.muted}>Use your name exactly as it appears on your Aadhaar.</AppText>
          <TextField label="First name" value={form.firstName} onChangeText={(v) => set('firstName', v)} autoComplete="given-name" error={errors.firstName} />
          <TextField label="Last name" value={form.lastName} onChangeText={(v) => set('lastName', v)} autoComplete="family-name" error={errors.lastName} />
          <TextField label="Date of birth" hint="Day, month, year. For example 12-03-1995." value={form.dateOfBirth} onChangeText={(v) => set('dateOfBirth', formatDobTyping(v))} keyboardType="number-pad" maxLength={10} placeholder="DD-MM-YYYY" error={errors.dateOfBirth} />
          <View style={{ gap: 6 }}>
            <AppText variant="bodyStrong">Gender</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {GENDERS.map(([value, label]) => <Chip key={value} label={label} selected={form.gender === value} onPress={() => set('gender', value)} />)}
            </View>
            {errors.gender ? <AppText variant="caption" color={colors.danger}>{errors.gender}</AppText> : null}
          </View>
          <TextField label="Mobile number" hint="We will call or message this number about your application." prefix="+91" value={form.phone} onChangeText={(v) => set('phone', v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} autoComplete="tel-national" error={errors.phone} />
          <TextField label="Email" hint="We send updates about your application here." value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" error={errors.email} />
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 14 }}>
          <AppText variant="body" color={colors.muted}>Zoove is starting in Mumbai.</AppText>
          <TextField label="Flat, building, street" value={form.addressLine} onChangeText={(v) => set('addressLine', v)} autoComplete="street-address" error={errors.addressLine} />
          <TextField label="Area or locality" value={form.addressArea} onChangeText={(v) => set('addressArea', v)} error={errors.addressArea} />
          <TextField label="City" value={view.form.addressCity} onChangeText={() => undefined} editable={false} />
          <TextField label="Pincode" value={form.addressPincode} onChangeText={(v) => set('addressPincode', v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} autoComplete="postal-code" error={errors.addressPincode} />
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <AppText variant="bodyStrong">What do you train?</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {services.map((item) => <Chip key={item.slug} label={item.name} selected={form.specialties.includes(item.slug)} onPress={() => toggle('specialties', item.slug)} />)}
            </View>
            {errors.specialties ? <AppText variant="caption" color={colors.danger}>{errors.specialties}</AppText> : null}
          </View>
          <TextField label="Years of experience" value={form.experienceYears} onChangeText={(v) => set('experienceYears', v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} error={errors.experienceYears} />
          <View style={{ gap: 6 }}>
            <AppText variant="bodyStrong">Languages you can train in</AppText>
            <AppText variant="caption" color={colors.muted}>Optional</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LANGUAGES.map((item) => <Chip key={item} label={item} selected={form.languages.includes(item)} onPress={() => toggle('languages', item)} />)}
            </View>
          </View>
          <TextField label="About you" hint="Optional. A line or two about your training style and background (up to 1000 characters)." value={form.bio} onChangeText={(v) => set('bio', v)} multiline maxLength={1000} />
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: 14 }}>
          <AppText variant="body" color={colors.muted}>We check your identity before anyone is booked with you. These details are stored securely and only the Zoove team can see them.</AppText>
          <TextField
            label="PAN number"
            hint={view.form.panLast4 ? `Already saved (ends ${view.form.panLast4}). Type a new one only if you want to change it.` : 'Ten characters, like ABCPE1234F.'}
            value={form.panNumber}
            onChangeText={(v) => set('panNumber', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            placeholder={view.form.panLast4 ? `Saved, ends ${view.form.panLast4}` : 'ABCPE1234F'}
            error={errors.panNumber}
          />
          <TextField label="Last 4 digits of Aadhaar" hint="Only the last 4 digits. We never ask for the full number here." value={form.aadhaarLast4} onChangeText={(v) => set('aadhaarLast4', v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} error={errors.aadhaarLast4} />
        </View>
      )}

      {step === 4 && (
        <View style={{ gap: 12 }}>
          {asked ? <Banner tone="warn">The Zoove team asked you to change only the documents marked &ldquo;Please upload again&rdquo;. The rest are locked.</Banner> : null}
          <AppText variant="body" color={colors.muted}>Clear photos, all four corners visible. JPG, PNG, WebP or PDF, up to 8 MB.</AppText>
          <DocumentRow title="Aadhaar card, front" help="Photo or PDF" doc={doc('aadhaar_front')} frozen={frozen('aadhaar_front')} allowPdf disabled={locked} busy={uploading === 'aadhaar_front'} onPick={(s) => void addDocument('aadhaar_front', s)} />
          <DocumentRow title="Aadhaar card, back" help="Photo or PDF" doc={doc('aadhaar_back')} frozen={frozen('aadhaar_back')} allowPdf disabled={locked} busy={uploading === 'aadhaar_back'} onPick={(s) => void addDocument('aadhaar_back', s)} />
          <DocumentRow title="PAN card" help="Photo or PDF" doc={doc('pan_card')} frozen={frozen('pan_card')} allowPdf disabled={locked} busy={uploading === 'pan_card'} onPick={(s) => void addDocument('pan_card', s)} />
          <DocumentRow title="Selfie" help="Taken now with your front camera" doc={doc('selfie')} frozen={frozen('selfie')} allowPdf={false} liveOnly disabled={locked} busy={uploading === 'selfie'} onPick={(s) => void addDocument('selfie', s)} />
          <AppText variant="sectionTitle" style={{ marginTop: 10 }}>Certificates</AppText>
          <AppText variant="body" color={colors.muted}>Add at least one yoga, fitness or other training certificate. It is required.</AppText>
          {extras.map((item) => (
            <DocumentRow
              key={item.id}
              title="Certificate"
              help=""
              doc={item}
              frozen={asked && item.status !== 'rejected'}
              allowPdf
              disabled={locked}
              busy={busy}
              onPick={addCertificate}
              onRemove={() => void dropDocument(item.id)}
              removeOnly
            />
          ))}
          {extras.length < 10 && !(asked && hasGoodCertificate) ? <Button label={uploading === 'certificate' ? 'Uploading…' : 'Add a certificate'} variant="soft" loading={uploading === 'certificate'} disabled={locked} onPress={addCertificate} /> : null}
          {missingDocs.length > 0 ? <AppText variant="caption" color={colors.muted}>Upload the four documents and at least one certificate to continue.</AppText> : null}
        </View>
      )}

      {step === 5 && (
        <View style={{ gap: 12 }}>
          <AppText variant="body" color={colors.muted}>Check everything once. You can change it until you submit.</AppText>
          <Summary title="About you" onEdit={() => setStep(0)} rows={[['Name', `${form.firstName} ${form.lastName}`], ['Date of birth', form.dateOfBirth], ['Mobile', `+91 ${form.phone}`], ['Email', form.email]]} />
          <Summary title="Address" onEdit={() => setStep(1)} rows={[['Address', `${form.addressLine}, ${form.addressArea}`], ['City', `${view.form.addressCity} ${form.addressPincode}`]]} />
          <Summary title="Experience" onEdit={() => setStep(2)} rows={[['Trains', form.specialties.map(serviceName).join(', ')], ['Experience', `${form.experienceYears} years`], ['Languages', form.languages.join(', ') || '—']]} />
          <Summary title="ID" onEdit={() => setStep(3)} rows={[['PAN', view.form.panLast4 ? `Ends ${view.form.panLast4}` : '—'], ['Aadhaar', `Ends ${form.aadhaarLast4}`]]} />
          <Summary title="Documents" onEdit={() => setStep(4)} rows={[['Uploaded', `${view.documents.filter((item) => item.status !== 'rejected').length} file(s)`]]} />
          {view.missing.length > 0 ? <Banner tone="warn">Still missing: please finish the earlier steps. Use the Edit links above.</Banner> : null}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44 }}>
            <View style={{ width: 24, height: 24, borderRadius: radius.sm, borderWidth: 1.5, borderColor: agree ? colors.purple : colors.line, backgroundColor: agree ? colors.purple : colors.white, alignItems: 'center', justifyContent: 'center' }}>
              {agree ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
            </View>
            <AppText variant="body" style={{ flex: 1 }}>I confirm these details are true and I agree to Zoove&apos;s terms and privacy policy.</AppText>
          </Pressable>
        </View>
      )}

      {problem ? <Banner tone="bad">{problem}</Banner> : null}
    </Screen>
  );
}

function Summary({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading">{title}</AppText>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={10}>
          <AppText variant="bodyStrong" color={colors.purple}>Edit</AppText>
        </Pressable>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
          <AppText variant="body" color={colors.muted} style={{ width: 96 }}>{label}</AppText>
          <AppText variant="body" style={{ flex: 1 }}>{value}</AppText>
        </View>
      ))}
    </Card>
  );
}
