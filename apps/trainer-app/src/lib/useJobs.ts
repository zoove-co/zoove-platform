import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getJobs, type JobBoard } from '@/lib/api';

export const JOBS_KEY = ['jobs'] as const;

/** The job board. It checks again every 20 seconds, so a new job shows up by itself. */
export function useJobs() {
  return useQuery({ queryKey: JOBS_KEY, queryFn: getJobs, refetchInterval: 20_000, staleTime: 10_000 });
}

export function useSetBoard() {
  const queryClient = useQueryClient();
  return (board: JobBoard) => queryClient.setQueryData(JOBS_KEY, board);
}

export const PEOPLE: Record<string, string> = { personal: 'Personal', duo: 'Duo', loved_one: 'Loved one', group: 'Group' };
export const whoFor = (job: { participant: string; groupSize: number | null }): string => `${PEOPLE[job.participant] ?? job.participant}${job.groupSize ? ` (${job.groupSize})` : ''}`;
