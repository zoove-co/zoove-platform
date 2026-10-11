import { formatInr } from '@zoove/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressPicker } from '@/components/booking/AddressPicker';
import { BookingSuccess } from '@/components/booking/BookingSuccess';
import { ParticipantPicker } from '@/components/booking/ParticipantPicker';
import { ReviewCard } from '@/components/booking/ReviewCard';
import { SchedulePicker } from '@/components/booking/SchedulePicker';
import { StylePicker } from '@/components/booking/StylePicker';
import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StepHeading } from '@/components/ui/StepHeading';
import { TabFooter } from '@/components/ui/TabFooter';
import { useAddresses, useCreateBooking, useService } from '@/features/booking/hooks';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import type { Address, BookingMode, BookingResult, Participant } from '@/lib/api';
import { formatWhen, nextDays } from '@/lib/dates';
import { colors, spacing } from '@/theme';

const LAST_STEP = 3;

export default function BookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string; mode?: string; format?: string }>();
  const mode: BookingMode =
    params.mode === 'instant' || params.mode === 'demo' ? params.mode : 'scheduled';

  const { data: home } = useHomeData();
  const { data: addresses } = useAddresses();
  const createBooking = useCreateBooking();

  const [participant, setParticipant] = useState<Participant>('personal');
  const [serviceSlug, setServiceSlug] = useState(params.service || 'yoga');
  const [formatSlug, setFormatSlug] = useState<string | undefined>(params.format || undefined);
  const [dayIso, setDayIso] = useState(() => nextDays(1)[0]?.iso ?? '');
  const [slotStartsAt, setSlotStartsAt] = useState<string | undefined>();
  const [pickedAddressId, setPickedAddressId] = useState<string | undefined>();
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<BookingResult | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToEndNext = useRef(false);

  const { data: service } = useService(serviceSlug);
  const format = service?.formats.find((item) => item.slug === formatSlug) ?? service?.formats[0];
  const defaultAddressId = addresses?.find((address) => address.isDefault)?.id ?? addresses?.[0]?.id;
  const selectedAddress = addresses?.find((address) => address.id === (pickedAddressId ?? defaultAddressId));
  const hours = home?.instant.etaHours ?? 4;
  const instant = mode === 'instant';
  const totalPaise = service?.pricePaise[mode];
  const priceLabel = totalPaise === undefined ? '' : formatInr(totalPaise);

  const canAdvance =
    step === 0
      ? participant === 'personal'
      : step === 1
        ? Boolean(service && format)
        : step === 2
          ? Boolean(selectedAddress?.serviceable) && (instant || Boolean(slotStartsAt))
          : Boolean(service && format && selectedAddress);

  const onServiceChange = (slug: string) => {
    setServiceSlug(slug);
    setFormatSlug(undefined);
  };

  const onFormatChange = (slug: string) => {
    setFormatSlug(slug);
    track('service_selected', { service_slug: serviceSlug, format_slug: slug, booking_for: participant });
  };

  const onDayChange = (iso: string) => {
    setDayIso(iso);
    setSlotStartsAt(undefined);
  };

  const onSlotChange = (startsAt: string) => {
    setSlotStartsAt(startsAt);
    track('slot_selected', { service_slug: serviceSlug, starts_at: startsAt, mode });
  };

  const onAddressSelect = (address: Address) => {
    setPickedAddressId(address.id);
    track('address_confirmed', { serviceable: address.serviceable });
  };

  const onConfirm = () => {
    if (!service || !format || !selectedAddress) return;
    createBooking.mutate(
      {
        serviceSlug,
        formatSlug: format.slug,
        mode,
        participant,
        addressId: selectedAddress.id,
        startsAt: instant ? undefined : slotStartsAt,
      },
      {
        onSuccess: (booking) => {
          track('booking_confirmed', {
            booking_id: booking.id,
            service_slug: serviceSlug,
            amount_paise: booking.totalPaise,
          });
          setResult(booking);
        },
      },
    );
  };

  const onPrimary = () => {
    if (step < LAST_STEP) {
      scrollToEndNext.current = true;
      setStep(step + 1);
    } else {
      onConfirm();
    }
  };

  const whenValue = instant
    ? t('booking.instantWhenTitle', { hours })
    : slotStartsAt
      ? formatWhen(slotStartsAt)
      : '';

  if (result) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('booking.confirmed')} />
        <View style={styles.successWrap}>
          <BookingSuccess
            title={t('booking.confirmed')}
            body={
              result.mode === 'instant'
                ? t('booking.successInstantBody')
                : t('booking.successBody', { service: result.serviceName, when: result.whenLabel })
            }
          />
        </View>
        <View style={styles.footer}>
          <PrimaryButton
            label={t('booking.viewBooking')}
            variant="soft"
            onPress={() => router.replace({ pathname: '/session/[id]', params: { id: result.id } })}
          />
          <PrimaryButton label={t('booking.backHome')} onPress={() => router.replace('/home')} />
        </View>
        <TabFooter />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('booking.title')} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        onContentSizeChange={() => {
          if (scrollToEndNext.current) {
            scrollToEndNext.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}>
        <ParticipantPicker value={participant} onChange={setParticipant} />

        {step >= 1 ? (
          <StylePicker
            services={home?.services ?? []}
            serviceSlug={serviceSlug}
            onServiceChange={onServiceChange}
            detail={service}
            formatSlug={formatSlug}
            onFormatChange={onFormatChange}
          />
        ) : null}

        {step >= 2 ? (
          <>
            {instant ? (
              <View style={styles.instantBox}>
                <StepHeading number="2" title={t('booking.instantWhenTitle', { hours })} />
                <AppText variant="caption" color={colors.muted}>
                  {t('booking.instantWhenDetail')}
                </AppText>
              </View>
            ) : (
              <SchedulePicker
                serviceSlug={serviceSlug}
                dayIso={dayIso}
                onDayChange={onDayChange}
                slotStartsAt={slotStartsAt}
                onSlotChange={onSlotChange}
              />
            )}
            <AddressPicker
              stepNumber={instant ? '3' : '4'}
              selectedId={selectedAddress?.id}
              onSelect={onAddressSelect}
            />
          </>
        ) : null}

        {step >= 3 && service && format ? (
          <ReviewCard
            stepNumber={instant ? '4' : '5'}
            heading={t('booking.reviewTitle')}
            detail={t('booking.reviewDetail')}
            title={`${format.name} · ${t('booking.personal')}`}
            subtitle={service.tagline}
            priceLabel={priceLabel}
            footnote={t('booking.prototypeNote')}
            rows={[
              { label: t('booking.rowWhen'), value: whenValue },
              { label: t('booking.rowCoach'), value: t('booking.coachValue') },
              { label: t('booking.rowFormat'), value: t('booking.formatValue') },
              {
                label: t('booking.rowAddress'),
                value: selectedAddress ? `${selectedAddress.label} · ${selectedAddress.area}` : '',
              },
              { label: t('booking.rowTotal'), value: priceLabel, emphasized: true },
            ]}
          />
        ) : null}

        {createBooking.isError ? (
          <AppText variant="caption" color={colors.danger}>
            {t('booking.error')}
          </AppText>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={step === LAST_STEP ? t('booking.confirmCta', { price: priceLabel }) : t('booking.continueCta')}
          disabled={!canAdvance}
          loading={createBooking.isPending}
          onPress={onPrimary}
        />
      </View>
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 17, paddingBottom: spacing.xxl, gap: 22 },
  instantBox: { gap: 10 },
  successWrap: { flex: 1 },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
  },
});
