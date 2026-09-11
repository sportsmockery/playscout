import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Row,
  Button,
  Field,
  ProgressBar,
  StatusBadge,
  EmptyState,
  ErrorState,
  Skeleton,
  ConfirmationSheet,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useHudlConnection, useHudlImports, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import { connectHudl, disconnectHudl, startHudlImport } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '@/utils/time';
import type { HudlImportJob } from '@/types/domain';
import type { StatusView } from '@/utils/status';

/**
 * Import a coach's own Hudl film.
 *
 * Hudl publishes no API for your own cut-ups, so a worker signs in as the coach
 * in a headless browser. That means a real password, which is why this screen
 * is explicit about where it goes: sent once over TLS, sealed server-side, and
 * never kept on the phone. The password state below is never persisted and is
 * cleared as soon as the request returns.
 */
export default function HudlScreen() {
  const theme = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();

  const connection = useHudlConnection(activeTeam?.id ?? null);
  const imports = useHudlImports(activeTeam?.id ?? null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const writable = canWrite(activeTeam?.role);

  function refresh() {
    if (!activeTeam) return;
    queryClient.invalidateQueries({ queryKey: qk.hudlConnection(activeTeam.id) });
    queryClient.invalidateQueries({ queryKey: qk.hudlImports(activeTeam.id) });
  }

  async function onConnect() {
    if (!activeTeam) return;
    setBusy(true);
    try {
      await connectHudl({ teamId: activeTeam.id, email: email.trim(), password });
      toast('Hudl account connected.', 'success');
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not connect that account', 'error');
    } finally {
      // Clear the password whether or not it worked — a failed attempt is no
      // reason to keep it sitting in memory behind a visible screen.
      setPassword('');
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!activeTeam) return;
    setBusy(true);
    try {
      await disconnectHudl(activeTeam.id);
      toast('Hudl account disconnected.', 'success');
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not disconnect', 'error');
    } finally {
      setBusy(false);
      setConfirmDisconnect(false);
    }
  }

  async function onImport() {
    if (!activeTeam) return;
    setUrlError(null);
    setBusy(true);
    try {
      await startHudlImport({ teamId: activeTeam.id, url: url.trim() });
      setUrl('');
      toast('Import queued. Clips appear in your film library as they land.', 'success');
      refresh();
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : 'That link could not be used.');
    } finally {
      setBusy(false);
    }
  }

  if (connection.isLoading) {
    return (
      <>
        <TopBar title="Hudl" />
        <Screen>
          <Skeleton height={140} />
        </Screen>
      </>
    );
  }

  if (connection.isError) {
    return (
      <>
        <TopBar title="Hudl" />
        <Screen>
          <ErrorState onRetry={() => connection.refetch()} />
        </Screen>
      </>
    );
  }

  const conn = connection.data;

  return (
    <>
      <TopBar title="Hudl" />
      <Screen>
        {!writable ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="body">{writeDeniedReason(activeTeam?.role)}</Text>
          </Card>
        ) : null}

        {conn && !conn.keyConfigured ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="label">Hudl import isn’t available yet</Text>
            <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
              PlayScout isn’t set up to store a Hudl login securely on this deployment.
              Contact your PlayScout admin.
            </Text>
          </Card>
        ) : conn?.connected ? (
          <Section title="Connected account" style={{ marginTop: 12 }}>
            <Card>
              <Text role="label">{conn.email}</Text>
              <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                {conn.lastVerifiedAt
                  ? `Last verified ${relativeTime(conn.lastVerifiedAt)}`
                  : 'Not verified yet'}
              </Text>
              {conn.lastError ? (
                <Text role="metadata" style={{ color: theme.colors.warning, marginTop: 8 }}>
                  {conn.lastError}
                </Text>
              ) : null}
              {writable ? (
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Disconnect"
                    variant="secondary"
                    onPress={() => setConfirmDisconnect(true)}
                  />
                </View>
              ) : null}
            </Card>
          </Section>
        ) : writable ? (
          <Section title="Connect your Hudl account" style={{ marginTop: 12 }}>
            <Card>
              <Text role="body" color="textSecondary" style={{ marginBottom: 14 }}>
                PlayScout signs in as you to pull your own film. Your password is sent once,
                encrypted on our server, and never stored on this phone. Disconnect any time.
              </Text>
              <Field
                label="Hudl email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                textContentType="username"
              />
              <Field
                label="Hudl password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                containerStyle={{ marginBottom: 8 }}
              />
              <Text role="metadata" color="textSecondary" style={{ marginBottom: 14 }}>
                If your Hudl account signs in through Google, connect it on the web instead.
              </Text>
              <Button
                label={busy ? 'Signing in…' : 'Connect Hudl'}
                onPress={onConnect}
                loading={busy}
                disabled={busy || !email.trim() || !password}
              />
            </Card>
          </Section>
        ) : null}

        {conn?.connected && writable ? (
          <Section title="Import a playlist">
            <Card>
              <Field
                label="Hudl playlist link"
                value={url}
                onChangeText={(v) => {
                  setUrl(v);
                  setUrlError(null);
                }}
                error={urlError}
                hint="Clips are pulled one at a time, so a full game takes a while."
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                inputMode="url"
                placeholder="https://www.hudl.com/video/…"
              />
              <Button
                label={busy ? 'Queueing…' : 'Start import'}
                onPress={onImport}
                loading={busy}
                disabled={busy || !url.trim()}
              />
            </Card>
          </Section>
        ) : null}

        {conn?.connected ? (
          <Section title="Imports">
            {imports.isLoading ? (
              <Skeleton height={80} radius={14} />
            ) : (imports.data?.jobs.length ?? 0) === 0 ? (
              <EmptyState title="No imports yet" message="Paste a playlist link above to start one." />
            ) : (
              (imports.data?.jobs ?? []).map((j) => <ImportRow key={j.id} job={j} />)
            )}
          </Section>
        ) : null}

        <View style={{ height: 24 }} />
      </Screen>

      <ConfirmationSheet
        visible={confirmDisconnect}
        title="Disconnect Hudl?"
        message="Your stored login is deleted. Film already imported stays in your library."
        confirmLabel={busy ? 'Disconnecting…' : 'Disconnect'}
        destructive
        onConfirm={onDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </>
  );
}

function importStatusView(status: string): StatusView {
  const tone: StatusView['tone'] =
    status === 'running' ? 'active'
    : status === 'completed' ? 'success'
    : status === 'failed' ? 'error'
    : status === 'completed_with_errors' ? 'warning'
    : 'neutral';
  const label =
    status === 'running' ? 'Importing'
    : status === 'queued' ? 'Queued'
    : status === 'completed' ? 'Done'
    : status === 'completed_with_errors' ? 'Done with errors'
    : status === 'failed' ? 'Failed'
    : status === 'cancelled' ? 'Stopped'
    : status;
  return { label, tone, isActive: status === 'running' || status === 'queued' };
}

function ImportRow({ job }: { job: HudlImportJob }) {
  const theme = useTheme();
  const found = job.clips_found ?? 0;
  const done = (job.clips_imported ?? 0) + (job.clips_failed ?? 0);
  const live = job.status === 'queued' || job.status === 'running';

  return (
    <Card style={{ marginBottom: 8 }}>
      <Row justify="space-between" align="flex-start">
        <Text role="label" style={{ flex: 1, paddingRight: 8 }} numberOfLines={1}>
          {job.title ?? 'Hudl playlist'}
        </Text>
        <StatusBadge status={importStatusView(job.status)} />
      </Row>

      {found > 0 ? (
        <View style={{ marginTop: 10 }}>
          <ProgressBar value={done / found} />
          <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
            {done} of {found} clip{found === 1 ? '' : 's'}
            {job.clips_failed ? ` · ${job.clips_failed} failed` : ''}
          </Text>
        </View>
      ) : live ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
          {job.current_step ?? 'Reading the playlist…'}
        </Text>
      ) : null}

      {job.error_message ? (
        <Text role="metadata" style={{ color: theme.colors.warning, marginTop: 8 }}>
          {job.error_message}
        </Text>
      ) : null}

      <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
        {relativeTime(job.created_at)}
      </Text>
    </Card>
  );
}
