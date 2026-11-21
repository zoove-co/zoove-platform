import { createContext, useCallback, useRef, type ComponentRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

type Scroller = ComponentRef<typeof ScrollView>;
export type FieldNode = ComponentRef<typeof View>;

// A text box that is tapped asks this to bring it into view. It is given to the fields by a screen's scrolling area.
export const FieldScrollContext = createContext<((field: FieldNode | null) => void) | null>(null);

// Keeps track of where a scrolling area is, and scrolls just enough to keep a tapped field clear of the keyboard.
// Spread `scrollProps` on the ScrollView and give `reveal` to FieldScrollContext.Provider.
export function useFieldScroll() {
  const scroller = useRef<Scroller>(null);
  const offset = useRef(0);
  const height = useRef(0);
  const reveal = useCallback((field: FieldNode | null) => {
    const scrollView = scroller.current;
    const inner = scrollView?.getInnerViewRef();
    if (!scrollView || !inner || !field) return;
    try {
      field.measureLayout(inner as never, (_x, y, _w, h) => {
        const top = y - 24;
        const bottom = y + h + 24;
        if (top < offset.current) scrollView.scrollTo({ y: Math.max(0, top), animated: true });
        else if (bottom > offset.current + height.current) scrollView.scrollTo({ y: bottom - height.current, animated: true });
      }, () => undefined);
    } catch {
      // Never let a layout measurement stop someone typing.
    }
  }, []);
  const scrollProps = {
    ref: scroller,
    scrollEventThrottle: 32,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = event.nativeEvent.contentOffset.y; },
    onLayout: (event: LayoutChangeEvent) => { height.current = event.nativeEvent.layout.height; },
  };
  return { reveal, scrollProps };
}
