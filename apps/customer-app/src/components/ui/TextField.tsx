import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts, radius } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  editable?: boolean;
};

export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  keyboardType,
  autoCapitalize,
  autoComplete,
  editable = true,
}: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="micro" color={colors.muted}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor="rgba(8, 11, 15, 0.3)"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        editable={editable}
        style={[styles.input, error ? styles.inputError : null, !editable && styles.inputOff]}
      />
      {error ? (
        <AppText variant="micro" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  input: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.sm,
    borderWidth: 0.8,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: colors.danger },
  inputOff: { opacity: 0.55 },
});
