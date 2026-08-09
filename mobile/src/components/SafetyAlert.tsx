import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import type { HeadContactFlag } from '@/types/domain';

/**
 * Head-contact observation. This is an interface element, not a legal footer.
 * It states what was OBSERVED and points to protocol — it never diagnoses, and
 * it sits ABOVE performance analysis wherever it appears. Acknowledgement does
 * not remove the record.
 */
export function SafetyAlert({
  flag,
  acknowledged,
  onAcknowledge,
}: {
  flag: HeadContactFlag;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
}) {
  const theme = useTheme();
  if (!flag?.flagged) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.root,
        { backgroundColor: theme.colors.error + '14', borderColor: theme.colors.error },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.error }]}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>!</Text>
        </View>
        <Text role="sectionTitle" style={{ color: theme.colors.error, flex: 1 }}>
          Possible head contact
        </Text>
      </View>

      <Text role="body" style={{ marginTop: 8 }}>
        {flag.note}
      </Text>

      <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
        This is an observation from the film, not a medical diagnosis. Follow your team or
        league concussion protocol before this player returns to contact.
      </Text>

      {onAcknowledge ? (
        <View style={{ marginTop: 12 }}>
          <Button
            label={acknowledged ? 'Acknowledged' : 'Acknowledge — keep on record'}
            variant={acknowledged ? 'secondary' : 'destructive'}
            disabled={acknowledged}
            fullWidth
            haptic={null}
            onPress={onAcknowledge}
            accessibilityHint="Marks that you have seen this observation. The record is kept."
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
