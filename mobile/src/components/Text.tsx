import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyRole } from '@/theme/tokens';

type ColorRole = 'text' | 'textSecondary' | 'gold' | 'error' | 'success' | 'warning' | 'onPrimary';

export interface TextProps extends Omit<RNTextProps, 'role'> {
  role?: TypographyRole;
  color?: ColorRole;
  /** Enables tabular figures for scores, timecodes, percentages, counts. */
  tabular?: boolean;
  align?: TextStyle['textAlign'];
}

/**
 * The single text primitive. Five roles only; color via semantic role. We never
 * disable font scaling, so Dynamic Type / Android scaling always apply.
 */
export function Text({
  role = 'body',
  color = 'text',
  tabular,
  align,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const roleStyle = theme.typography[role];
  const resolvedColor =
    color === 'gold' ? theme.colors.gold : theme.colors[color as keyof typeof theme.colors] as string;

  return (
    <RNText
      allowFontScaling
      style={[
        roleStyle,
        { color: resolvedColor },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
