import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A wrapping set of single-choice chips.
 *
 * A native picker hides every option but the chosen one behind a tap, which is
 * wrong for short closed sets a coach is choosing between (age band, level,
 * game type) — seeing the alternatives is most of the decision. `allowClear`
 * lets a chip be tapped off, because "not set" is a legitimate answer for
 * fields that aren't required.
 */
export function ChipSelect<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  allowClear = true,
}: {
  label: string;
  hint?: string;
  options: readonly ChipOption<T>[];
  value: T | '';
  onChange: (value: T | '') => void;
  allowClear?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text role="label" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <View style={styles.wrap}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(active && allowClear ? '' : o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={o.label}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: active ? theme.colors.gold + '22' : theme.colors.surface,
                borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                borderColor: active ? theme.colors.gold : theme.colors.border,
              }}
            >
              <Text role="metadata" style={{ color: active ? theme.colors.gold : theme.colors.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
