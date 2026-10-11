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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  });
}

export function useBooking(id: string) {
  return useQuery({ queryKey: ['booking', id], queryFn: () => api.getBooking(id) });
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
  });
}

export function useCancelBooking(id: string) {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: () => api.cancelBooking(id),
    onSuccess: () => refresh(id),
  });
}
