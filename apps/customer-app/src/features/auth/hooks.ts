import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ProfileUpdate } from '@/lib/api';

// Sign-in is by emailed code for now. The phone (SMS) calls stay on the API for when SMS is approved.
export function useRequestOtp() {
  return useMutation({ mutationFn: (email: string) => api.requestEmailOtp(email) });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: ({ email, code, acceptedTerms }: { email: string; code: string; acceptedTerms: boolean }) =>
      api.verifyEmailOtp(email, code, acceptedTerms),
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

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => api.deleteAccount() });
}
