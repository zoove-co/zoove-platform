import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ProfileUpdate } from '@/lib/api';

export function useRequestOtp() {
  return useMutation({ mutationFn: (phone: string) => api.requestOtp(phone) });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) => api.verifyOtp(phone, code),
  });
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api.getProfile() });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) => api.updateProfile(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
      ]),
  });
}
