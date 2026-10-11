import { createElement } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = { svg: string; size: number; style?: StyleProp<ViewStyle> };

// The designer SVGs use SMIL animation, which react-native-svg cannot play.
// Web: <img> plays SMIL natively. Native: a transparent WebView renders it.
export function SvgAnimation({ svg, size, style }: Props) {
  const box = { width: size, height: size };

  if (Platform.OS === 'web') {
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return (
      <View style={[box, style]} pointerEvents="none">
        {createElement('img', { src: uri, alt: '', style: { width: '100%', height: '100%' } })}
      </View>
    );
  }

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}svg{width:100%;height:100%}</style></head><body>${svg}</body></html>`;
  return (
    <View style={[box, styles.native, style]} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        androidLayerType="hardware"
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  native: { backgroundColor: 'transparent' },
  web: { backgroundColor: 'transparent', flex: 1 },
});
