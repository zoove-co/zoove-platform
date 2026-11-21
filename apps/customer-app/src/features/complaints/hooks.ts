import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, type ComplaintDetail, type NewComplaintInput } from '@/lib/api';

// True while this screen is the one the person is looking at. Polling stops when another screen is on top.
function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 5_000;

// My complaints. `poll` keeps the list fresh while it is on screen, so a reply from the team shows up without leaving the screen.
export function useComplaints(poll = false) {
  const focused = useScreenFocused();
  return useQuery({ queryKey: ['complaints'], queryFn: () => api.listComplaints(), refetchInterval: poll && focused ? LIST_POLL_MS : false });
}

// One thread. Checks for new messages every few seconds while it is open (the phone also gets a notification when the team writes).
export function useComplaint(id: string) {
  const focused = useScreenFocused();
  return useQuery({ queryKey: ['complaint', id], queryFn: () => api.getComplaint(id), refetchInterval: focused ? THREAD_POLL_MS : false, staleTime: 0 });
}

export function useComplaintCategories() {
  return useQuery({ queryKey: ['complaint-categories'], queryFn: () => api.complaintCategories(), staleTime: 10 * 60_000 });
}

export function useComplaintSessions() {
  return useQuery({ queryKey: ['complaint-sessions'], queryFn: () => api.complaintSessions(), staleTime: 60_000 });
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewComplaintInput) => api.createComplaint(input),
    onSuccess: (detail: ComplaintDetail) => {
      queryClient.setQueryData(['complaint', detail.id], detail);
      return queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}

export function useReplyToComplaint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.replyToComplaint(id, body),
    onSuccess: (detail: ComplaintDetail) => {
      queryClient.setQueryData(['complaint', id], detail);
      return queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}
