import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type BookingInput, type BookingMode, type BookingStatus, type NewAddress, type PartyPlanInput, type ProgressProfile } from '@/lib/api';

// Waiting on the system to find a coach: keep the screen fresh without the customer pulling.
const isSearchingStatus = (status: BookingStatus | undefined) => status === 'matching' || status === 'rematching';

export function useService(slug: string) {
  return useQuery({ queryKey: ['service', slug], queryFn: () => api.getService(slug) });
}

export function useAddresses() {
  return useQuery({ queryKey: ['addresses'], queryFn: () => api.listAddresses() });
}

export function useServiceability(pincode: string, pin: { latitude: number; longitude: number } | null) {
  const code = pincode.trim();
  return useQuery({
    queryKey: ['serviceability', code, pin?.latitude ?? null, pin?.longitude ?? null],
    queryFn: () => api.checkServiceability({ pincode: code, ...(pin ?? {}) }),
    enabled: /^[1-9][0-9]{5}$/.test(code),
    staleTime: 5 * 60_000,
  });
}

export function useAddAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAddress) => api.addAddress(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['addresses'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
      ]),
  });
}

export function useSlots(serviceSlug: string, isoDate: string) {
  return useQuery({
    queryKey: ['slots', serviceSlug, isoDate],
    queryFn: () => api.getSlots(serviceSlug, isoDate),
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingInput) => api.createBooking(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['streak'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['my-packages'] }),
        queryClient.invalidateQueries({ queryKey: ['referral'] }),
      ]),
    // Slots may have changed under us (someone else took one); refetch either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots'] }),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.getBooking(id),
    // While a coach is being matched, keep checking so the screen updates by itself.
    refetchInterval: (query) => (isSearchingStatus(query.state.data?.status) ? 5000 : false),
  });
}

export function useBookings() {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.listBookings(),
    // A trainer cancelling can happen any time, so the list keeps itself current.
    refetchInterval: (query) => (query.state.data?.some((b) => isSearchingStatus(b.status)) ? 5000 : false),
  });
}

export function usePastCoaches() {
  return useQuery({ queryKey: ['past-coaches'], queryFn: () => api.listPastCoaches() });
}

export function useReferral() {
  return useQuery({ queryKey: ['referral'], queryFn: () => api.getReferral() });
}

export function useApplyReferralCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.applyReferralCode(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['referral'] }),
  });
}

export function useMyPackages() {
  return useQuery({ queryKey: ['my-packages'], queryFn: () => api.getMyPackages() });
}

export function useBuyPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { packageId: string; discountCode?: string; idempotencyKey: string }) => api.buyPackage(input),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['my-packages'] }), queryClient.invalidateQueries({ queryKey: ['notifications'] })]),
  });
}

export function useCancelPackageOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelPackageOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-packages'] }),
  });
}

export function useProgressProfile() {
  return useQuery({ queryKey: ['progress-profile'], queryFn: () => api.getProgressProfile() });
}

export function useSaveProgressProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProgressProfile) => api.saveProgressProfile(input),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['progress-profile'] }), queryClient.invalidateQueries({ queryKey: ['streak'] }), queryClient.invalidateQueries({ queryKey: ['home'] })]),
  });
}

export function useStreak() {
  return useQuery({ queryKey: ['streak'], queryFn: () => api.getStreak() });
}

export function useSavePartyPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PartyPlanInput) => api.savePartyPlan(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function usePackages() {
  return useQuery({ queryKey: ['packages'], queryFn: () => api.listPackages(), staleTime: 60_000 });
}

function useRefreshBookings() {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['booking', id] }),
      queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['streak'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['my-packages'] }),
    ]);
  };
}

export function useRescheduleBooking(id: string) {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: (startsAt: string) => api.rescheduleBooking(id, startsAt),
    onSuccess: () => refresh(id),
    onError: () => refresh(id),
  });
}

export function useCancelBooking(id: string) {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: () => api.cancelBooking(id),
    onSuccess: () => refresh(id),
    onError: () => refresh(id),
  });
}

// Development only: pretend the assigned coach cancelled, to see the customer side of it.
export function useSimulateTrainerCancel(id: string) {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: async () => {
      await api.dev?.simulateTrainerCancel(id);
    },
    onSettled: () => refresh(id),
  });
}

export function usePreviewDiscount() {
  return useMutation({ mutationFn: (input: { code: string; serviceSlug: string; mode: BookingMode }) => api.previewDiscount(input) });
}
