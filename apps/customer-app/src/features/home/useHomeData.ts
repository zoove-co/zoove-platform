import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useHomeData() {
  return useQuery({ queryKey: ['home'], queryFn: () => api.getHome() });
}
