import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, radius } from '@/theme';

export type Banner = { key: string; image: ImageSourcePropType; label: string; onPress: () => void };

const ADVANCE_MS = 4500;

// Swipeable 16:9 banners that also move on their own, like the prototype. Pauses while touched.
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Banner>>(null);
  const indexRef = useRef(0);
  const paused = useRef(false);
  const height = (width * 9) / 16;
  const count = banners.length;

  useEffect(() => {
    if (width === 0 || count < 2) return undefined;
    const timer = setInterval(() => {
      if (paused.current) return;
      const next = (indexRef.current + 1) % count;
      indexRef.current = next;
      setIndex(next);
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [width, count]);

  if (count === 0) return null;

  return (
    <View style={styles.wrap} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          data={banners}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            paused.current = true;
          }}
          onScrollEndDrag={() => {
            paused.current = false;
          }}
          onScroll={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width);
            if (next !== indexRef.current && next >= 0 && next < count) {
              indexRef.current = next;
              setIndex(next);
            }
          }}
          style={{ height }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={{ width, height }}>
              <Image source={item.image} contentFit="cover" style={styles.image} />
            </Pressable>
          )}
        />
      ) : null}
      <View style={styles.dots}>
        {banners.map((banner, i) => (
          <View key={banner.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  image: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 0.8,
    borderColor: colors.line,
    backgroundColor: colors.lavender,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { width: 16, backgroundColor: colors.purple },
});
