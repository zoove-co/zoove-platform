import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type BookingInput, type NewAddress } from '@/lib/api';

export function useService(slug: string) {
  return useQuery({ queryKey: ['service', slug], queryFn: () => api.getService(slug) });
}

export function useAddresses() {
  return useQuery({ queryKey: ['addresses'], queryFn: () => api.listAddresses() });
}

export function useAddAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAddress) => api.addAddress(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
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
    refetchInterval: (query) => (query.state.data?.status === 'matching' ? 5000 : false),
  });
}

export function useBookings() {
  return useQuery({ queryKey: ['bookings'], queryFn: () => api.listBookings() });
}

function useRefreshBookings() {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['booking', id] }),
      queryClient.invalidateQueries({ queryKey: ['bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
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
