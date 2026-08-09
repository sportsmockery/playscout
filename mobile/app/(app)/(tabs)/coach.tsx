import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar, Text, Button, EmptyState, useToast } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamStore } from '@/stores/teamStore';
import { useChat, type ChatTurn } from '@/features/coach/useChat';

const STARTERS = [
  'What should we fix at practice this week?',
  'What are our biggest tendencies on offense?',
  'Summarize what the film shows about our line play.',
];

export default function CoachScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { activeTeam } = useTeamStore();
  const { turns, streaming, send, stop, retry } = useChat(activeTeam?.id ?? null, {
    teamName: activeTeam?.name,
    ageGroup: activeTeam?.ageGroup ?? undefined,
  });
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatTurn>>(null);

  function onSend(text?: string) {
    const value = (text ?? input).trim();
    if (!value) return;
    send(value);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <>
      <TopBar showTeamSwitcher />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        {turns.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              title="PlayScoutIQ"
              message="Ask about your team. Answers are grounded only in the film and analysis you’ve run — it will say when there isn’t enough evidence yet."
            />
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {STARTERS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => onSend(s)}
                  style={[styles.starter, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                >
                  <Text role="body">{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={turns}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <Bubble
                turn={item}
                onCopy={() => {
                  Clipboard.setStringAsync(item.content).catch(() => {});
                  toast('Copied');
                }}
              />
            )}
          />
        )}

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { paddingBottom: insets.bottom + 8, backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
          ]}
        >
          {turns.length > 0 ? (
            <View style={styles.controlRow}>
              {streaming ? (
                <Text role="metadata" color="gold" onPress={stop}>
                  Stop
                </Text>
              ) : (
                <Text role="metadata" color="textSecondary" onPress={retry}>
                  Retry
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask PlayScoutIQ…"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              style={[
                styles.input,
                { color: theme.colors.text, backgroundColor: theme.colors.fill, borderRadius: theme.radius.lg },
              ]}
            />
            <View style={{ width: 88 }}>
              <Button
                label="Send"
                onPress={() => onSend()}
                disabled={streaming || input.trim() === ''}
                haptic={null}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ turn, onCopy }: { turn: ChatTurn; onCopy: () => void }) {
  const theme = useTheme();
  const isUser = turn.role === 'user';
  return (
    <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <Pressable
        onLongPress={onCopy}
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? theme.colors.primary : theme.colors.surface,
            borderColor: isUser ? 'transparent' : theme.colors.border,
            borderLeftColor: isUser ? 'transparent' : theme.colors.gold,
            borderLeftWidth: isUser ? 0 : 3,
          },
        ]}
      >
        <Text role="body" color={isUser ? 'onPrimary' : 'text'}>
          {turn.content || (turn.role === 'assistant' ? '…' : '')}
        </Text>
        {turn.redacted ? (
          <Text role="metadata" style={{ color: theme.colors.warning, marginTop: 6 }}>
            Part of this reply was withheld for safety.
          </Text>
        ) : null}
        {turn.error ? (
          <Text role="metadata" style={{ color: theme.colors.error, marginTop: 6 }}>
            PlayScoutIQ hit a problem. Tap Retry below.
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  starter: { padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8 },
  controlRow: { alignItems: 'flex-end', paddingBottom: 4, paddingRight: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  bubble: { maxWidth: '88%', padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
