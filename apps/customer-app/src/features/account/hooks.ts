import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useSetDefaultAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setDefaultAddress(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAddress(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => api.listNotifications() });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.markNotificationsRead(),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
      ]),
  });
}
