import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { errorMessage, saveNote } from '@/lib/api';
import { useSetBoard } from '@/lib/useJobs';
import { colors } from '@/theme';

// A private note on one session. Only this trainer can read it; the customer and the team never see it here.
export function SessionNote({ id, note }: { id: string; note: string }) {
  const setBoard = useSetBoard();
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== note.trim();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setBoard(await saveNote(id, text.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <TextField label="Private note" hint="Only you can see this. Add what to remember for next time." placeholder="For example: prefers a slower warm-up" value={text} onChangeText={setText} multiline maxLength={2000} />
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {changed ? <Button label="Save note" small variant="soft" loading={busy} onPress={() => void save()} /> : note ? <AppText variant="caption" color={colors.muted}>Saved</AppText> : null}
    </View>
  );
}
