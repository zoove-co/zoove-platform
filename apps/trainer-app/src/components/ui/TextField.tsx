import { useContext, useRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FieldScrollContext, type FieldNode } from '@/components/ui/fieldScroll';
import { colors, fonts, radius } from '@/theme';

type Props = Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'maxLength' | 'multiline' | 'placeholder' | 'textContentType'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  hint?: string;
  error?: string | undefined;
  editable?: boolean;
  prefix?: string;
};

export function TextField({ label, value, onChangeText, onBlur, hint, error, editable = true, prefix, multiline, ...rest }: Props) {
  const wrap = useRef<FieldNode>(null);
  const reveal = useContext(FieldScrollContext);
  return (
    <View ref={wrap} collapsable={false} style={styles.wrap}>
      <AppText variant="bodyStrong">{label}</AppText>
      <View style={[styles.box, error ? styles.boxError : null, !editable && styles.boxOff]}>
        {prefix ? (
          <AppText variant="bodyStrong" color={colors.muted}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          onFocus={() => { if (reveal) setTimeout(() => reveal(wrap.current), 300); }}
          editable={editable}
          multiline={multiline}
          placeholderTextColor="rgba(8, 11, 15, 0.3)"
          style={[styles.input, multiline && styles.multiline]}
          {...rest}
        />
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.muted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 50, borderRadius: radius.sm, borderWidth: 0.8, borderColor: colors.line, backgroundColor: colors.white },
  boxError: { borderColor: colors.danger },
  boxOff: { opacity: 0.55 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, paddingVertical: 11 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
});
