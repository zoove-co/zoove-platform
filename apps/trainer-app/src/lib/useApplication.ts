import { useQuery } from '@tanstack/react-query';

import { getApplication, type ApplicationView } from '@/lib/api';

export const APPLICATION_KEY = ['application'] as const;

export function useApplication(options: { refetchEverySeconds?: number } = {}) {
  return useQuery({
    queryKey: APPLICATION_KEY,
    queryFn: getApplication,
    staleTime: 15_000,
    ...(options.refetchEverySeconds ? { refetchInterval: options.refetchEverySeconds * 1000 } : {}),
  });
}

export type Destination = 'apply' | 'status' | 'jobs';

/** Where a trainer belongs, decided only by the application the server holds. The same on the web page and in the app. */
export function destinationFor(view: ApplicationView): Destination {
  if (['none', 'draft', 'changes_requested'].includes(view.status)) return 'apply';
  if (view.status === 'approved' && view.trainerStatus === 'active') return 'jobs';
  return 'status'; // waiting for review, turned down, or an approved account that is paused or suspended
}
