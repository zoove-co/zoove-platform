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
