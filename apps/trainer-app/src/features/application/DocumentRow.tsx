import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ApplicationView } from '@/lib/api';
import type { FileSource } from '@/lib/files';
import { colors, radius } from '@/theme';

type Doc = ApplicationView['documents'][number];

type Props = {
  title: string;
  help: string;
  doc: Doc | undefined;
  /** The team asked for changes elsewhere: this one is accepted and stays as it is. */
  frozen: boolean;
  /** The selfie must be taken now with the front camera. */
  liveOnly?: boolean;
  allowPdf: boolean;
  disabled: boolean;
  busy: boolean;
  onPick: (source: FileSource) => void;
  onRemove?: () => void;
  /** Certificates are added one by one, so a row can only be removed (a new one is added with the Add button). */
  removeOnly?: boolean;
};

export function DocumentRow({ title, help, doc, frozen, liveOnly = false, allowPdf, disabled, busy, onPick, onRemove, removeOnly = false }: Props) {
  const rejected = doc?.status === 'rejected';
  const has = Boolean(doc) && !rejected;
  const locked = disabled || frozen || busy;

  function choose() {
    if (liveOnly) return onPick('camera');
    const buttons = [
      { text: 'Take a photo', onPress: () => onPick('camera') },
      { text: 'Choose from gallery', onPress: () => onPick('library') },
      ...(allowPdf ? [{ text: 'Choose a PDF', onPress: () => onPick('pdf') }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(title, 'Clear photo, all four corners visible.', buttons);
  }

  return (
    <View style={styles.row}>
      <View style={[styles.tick, has ? styles.tickOk : rejected ? styles.tickBad : null]}>
        <Icon name={has ? 'checkmark' : rejected ? 'alert' : 'document-outline'} size={18} color={has ? colors.white : rejected ? colors.white : colors.purple} />
      </View>
      <View style={styles.meta}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color={rejected ? colors.danger : has ? colors.success : colors.muted}>
          {rejected ? `Please upload again${doc?.note ? `: ${doc.note}` : ''}` : has ? (doc?.status === 'accepted' ? 'Accepted' : 'Uploaded') : help}
        </AppText>
      </View>
      {frozen ? null : (
        <View style={styles.action}>
          {removeOnly ? null : <Button label={has ? 'Replace' : 'Add'} small variant="soft" loading={busy} disabled={disabled} onPress={choose} />}
          {onRemove ? <Button label="Remove" small variant={removeOnly ? 'soft' : 'ghost'} disabled={locked} onPress={onRemove} /> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 0.8, borderColor: colors.line, backgroundColor: colors.white },
  tick: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lavender },
  tickOk: { backgroundColor: colors.success },
  tickBad: { backgroundColor: colors.danger },
  meta: { flex: 1, gap: 2 },
  action: { alignItems: 'flex-end', gap: 2 },
});
