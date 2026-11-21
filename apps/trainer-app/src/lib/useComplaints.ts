import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { createComplaint, getComplaint, getComplaintCategories, getComplaintSessions, getComplaintUnread, getMyComplaints, replyToComplaint, type ComplaintDetail, type NewComplaint } from '@/lib/api';

export const COMPLAINTS_KEY = ['complaints'] as const;
export const COMPLAINT_UNREAD_KEY = ['complaint-unread'] as const;

// True while this screen is the one the trainer is looking at, so polling stops when another screen is on top.
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
const UNREAD_POLL_MS = 60_000;

/** My complaints. `poll` keeps the list fresh while it is on screen. */
export function useComplaints(poll = false) {
  const focused = useScreenFocused();
  return useQuery({ queryKey: COMPLAINTS_KEY, queryFn: getMyComplaints, refetchInterval: poll && focused ? LIST_POLL_MS : false });
}

/** One thread. Checks for new messages every few seconds while it is open (the phone also gets a notification when the team writes). */
export function useComplaint(id: string) {
  const focused = useScreenFocused();
  return useQuery({ queryKey: ['complaint', id], queryFn: () => getComplaint(id), refetchInterval: focused ? THREAD_POLL_MS : false, staleTime: 0 });
}

/** The number of conversations with a reply the trainer has not read: the dot on the Profile tab. */
export function useComplaintUnread() {
  return useQuery({ queryKey: COMPLAINT_UNREAD_KEY, queryFn: getComplaintUnread, refetchInterval: UNREAD_POLL_MS, staleTime: 30_000 });
}

export const useComplaintCategories = () => useQuery({ queryKey: ['complaint-categories'], queryFn: getComplaintCategories, staleTime: 10 * 60_000 });
export const useComplaintSessions = () => useQuery({ queryKey: ['complaint-sessions'], queryFn: getComplaintSessions, staleTime: 60_000 });

export function useCreateComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewComplaint) => createComplaint(input),
    onSuccess: (detail: ComplaintDetail) => {
      queryClient.setQueryData(['complaint', detail.id], detail);
      void queryClient.invalidateQueries({ queryKey: COMPLAINT_UNREAD_KEY });
      return queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
    },
  });
}

export function useReplyToComplaint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => replyToComplaint(id, body),
    onSuccess: (detail: ComplaintDetail) => {
      queryClient.setQueryData(['complaint', id], detail);
      return queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
    },
  });
}

/** "5 min ago", "Yesterday", "12 Nov". */
export function formatAgo(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
