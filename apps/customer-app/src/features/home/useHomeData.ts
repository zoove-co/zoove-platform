import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useHomeData() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () => api.getHome(),
    // A coach can cancel or be found at any time, so Home keeps itself current while a session is coming.
    refetchInterval: (query) => (query.state.data?.upcomingSession ? 10_000 : false),
  });
}
