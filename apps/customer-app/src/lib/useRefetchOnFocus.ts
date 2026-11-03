import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

// React Native has no "window focus", so screens do not refresh when you come back to them.
// Call this with a query's refetch: it refetches every time the screen regains focus (not on first mount, which already fetches).
export function useRefetchOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}
