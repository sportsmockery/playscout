import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Row,
  Button,
  Field,
  ChipSelect,
  EmptyState,
  ErrorState,
  Skeleton,
  BottomSheet,
  ConfirmationSheet,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useOrgMembers, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { isAdmin, ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/utils/roles';
import {
  addOrgMember,
  updateMemberRole,
  removeOrgMember,
  setMemberTeamAccess,
  type OrgMember,
} from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '@/utils/time';
import type { UserRole } from '@/types/domain';

/**
 * Members and their team access.
 *
 * The local role only decides what to render — every call here goes through
 * requireAdmin() on the server, which is the check that actually counts.
 */
export default function AdminScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();
  const admin = isAdmin(activeTeam?.role);
  const members = useOrgMembers(admin);

  const [editing, setEditing] = useState<OrgMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<OrgMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: qk.orgMembers });
  }

  if (!admin) {
    return (
      <>
        <TopBar title="Members" />
        <Screen>
          <Card style={{ marginTop: 16 }}>
            <Text role="body">
              Managing members needs owner or admin access on this organization.
            </Text>
          </Card>
        </Screen>
      </>
    );
  }

  async function onInvite(email: string, role: UserRole) {
    setBusy(true);
    try {
      const res = await addOrgMember({ email, role });
      refresh();
      setInviting(false);
      // A generated password is shown once and cannot be recovered, so it gets
      // its own sheet rather than a toast that can be missed.
      if (res.tempPassword) setTempPassword({ email: res.email, password: res.tempPassword });
      else toast('Member added.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that member', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMember(role: UserRole, allTeams: boolean, teamIds: string[]) {
    if (!editing) return;
    setBusy(true);
    try {
      if (role !== editing.role) await updateMemberRole({ userId: editing.userId, role });
      await setMemberTeamAccess({ userId: editing.userId, allTeams, teamIds });
      refresh();
      setEditing(null);
      toast('Member updated.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update that member', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeOrgMember(removing.userId);
      refresh();
      setRemoving(null);
      toast('Member removed from the organization.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove that member', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Members" />
      <Screen>
        <View style={{ marginTop: 12 }}>
          <Button label="Add a member" onPress={() => setInviting(true)} />
        </View>

        <Section title="Organization">
          {members.isLoading ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} radius={14} />
              ))}
            </View>
          ) : members.isError ? (
            <ErrorState onRetry={() => members.refetch()} />
          ) : (members.data?.members.length ?? 0) === 0 ? (
            <EmptyState title="No members yet" message="Add a coach to get started." />
          ) : (
            (members.data?.members ?? []).map((m) => {
              const locked = m.role === 'owner' || m.isSelf;
              return (
                <Pressable
                  key={m.id}
                  onPress={locked ? undefined : () => setEditing(m)}
                  disabled={locked}
                  accessibilityRole="button"
                >
                  <Card style={{ marginBottom: 8 }}>
                    <Row justify="space-between" align="flex-start">
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text role="label" numberOfLines={1}>
                          {m.email}
                        </Text>
                        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                          {ROLE_LABELS[m.role]}
                          {m.isSelf ? ' · you' : ''}
                          {m.allTeams
                            ? ' · all teams'
                            : m.teamIds.length
                              ? ` · ${m.teamIds.length} team${m.teamIds.length === 1 ? '' : 's'}`
                              : ' · no teams'}
                        </Text>
                        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                          {m.lastSignInAt
                            ? `Last in ${relativeTime(m.lastSignInAt)}`
                            : 'Never signed in'}
                        </Text>
                      </View>
                      {locked ? null : (
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>›</Text>
                      )}
                    </Row>
                  </Card>
                </Pressable>
              );
            })
          )}
        </Section>

        <Section title="Usage">
          <Card>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/admin/usage')}>
              <Row justify="space-between">
                <Text role="label" color="gold">
                  AI spend and cache performance
                </Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>›</Text>
              </Row>
            </Pressable>
          </Card>
        </Section>

        <View style={{ height: 24 }} />
      </Screen>

      <InviteSheet visible={inviting} busy={busy} onClose={() => setInviting(false)} onInvite={onInvite} />

      <MemberSheet
        member={editing}
        teams={members.data?.teams ?? []}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={onSaveMember}
        onRequestRemove={() => {
          const m = editing;
          setEditing(null);
          setRemoving(m);
        }}
      />

      <BottomSheet
        visible={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="Temporary password"
      >
        <Text role="body">
          A new account was created for {tempPassword?.email}. Give them this password — it is
          shown once and cannot be recovered.
        </Text>
        <Card style={{ marginTop: 12 }}>
          <Text role="sectionTitle" selectable>
            {tempPassword?.password}
          </Text>
        </Card>
        <View style={{ marginTop: 16 }}>
          <Button label="Done" onPress={() => setTempPassword(null)} />
        </View>
      </BottomSheet>

      <ConfirmationSheet
        visible={!!removing}
        title="Remove this member?"
        message={
          removing
            ? `${removing.email} will lose access to this organization. Their account is not deleted.`
            : undefined
        }
        confirmLabel={busy ? 'Removing…' : 'Remove member'}
        destructive
        onConfirm={onRemove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function InviteSheet({
  visible,
  busy,
  onClose,
  onInvite,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onInvite: (email: string, role: UserRole) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('coach');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a member">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
        placeholder="coach@team.org"
      />
      <ChipSelect<UserRole>
        label="Role"
        options={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        value={role}
        onChange={(r) => r && setRole(r)}
        allowClear={false}
        hint={ROLE_DESCRIPTIONS[role]}
      />
      <Button
        label={busy ? 'Adding…' : 'Add member'}
        onPress={() => onInvite(email.trim().toLowerCase(), role)}
        loading={busy}
        disabled={busy || !valid}
      />
    </BottomSheet>
  );
}

function MemberSheet({
  member,
  teams,
  busy,
  onClose,
  onSave,
  onRequestRemove,
}: {
  member: OrgMember | null;
  teams: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (role: UserRole, allTeams: boolean, teamIds: string[]) => void;
  onRequestRemove: () => void;
}) {
  const theme = useTheme();
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('coach');
  const [allTeams, setAllTeams] = useState(false);
  const [teamIds, setTeamIds] = useState<string[]>([]);

  // Re-seed when the sheet opens on a different member, so one member's access
  // is never saved onto another.
  if (member && seededFor !== member.userId) {
    setSeededFor(member.userId);
    setRole(member.role);
    setAllTeams(member.allTeams);
    setTeamIds(member.teamIds);
  }
  if (!member && seededFor !== null) setSeededFor(null);

  return (
    <BottomSheet visible={!!member} onClose={onClose} title={member?.email ?? 'Member'}>
      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        <ChipSelect<UserRole>
          label="Role"
          options={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={role}
          onChange={(r) => r && setRole(r)}
          allowClear={false}
          hint={ROLE_DESCRIPTIONS[role]}
        />

        <Text role="label" style={{ marginBottom: 6 }}>
          Team access
        </Text>
        <Pressable
          onPress={() => setAllTeams((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allTeams }}
          style={{
            padding: 12,
            borderRadius: theme.radius.md,
            borderWidth: allTeams ? 1.5 : 1,
            borderColor: allTeams ? theme.colors.gold : theme.colors.border,
            backgroundColor: theme.colors.surface,
            marginBottom: 10,
          }}
        >
          <Row justify="space-between">
            <Text role="body" style={{ flex: 1 }}>
              Every team, including ones added later
            </Text>
            {allTeams ? <Text style={{ color: theme.colors.gold }}>✓</Text> : null}
          </Row>
        </Pressable>

        {!allTeams ? (
          teams.length === 0 ? (
            <Text role="metadata" color="textSecondary">
              This organization has no teams yet.
            </Text>
          ) : (
            teams.map((t) => {
              const on = teamIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() =>
                    setTeamIds((prev) =>
                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: theme.radius.md,
                    borderWidth: on ? 1.5 : 1,
                    borderColor: on ? theme.colors.gold : theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <Row justify="space-between">
                    <Text role="body" style={{ flex: 1 }}>
                      {t.name}
                    </Text>
                    {on ? <Text style={{ color: theme.colors.gold }}>✓</Text> : null}
                  </Row>
                </Pressable>
              );
            })
          )
        ) : null}
      </ScrollView>

      <View style={{ marginTop: 12 }}>
        <Button
          label={busy ? 'Saving…' : 'Save'}
          onPress={() => onSave(role, allTeams, teamIds)}
          loading={busy}
          disabled={busy}
        />
        <Pressable onPress={onRequestRemove} style={{ marginTop: 14, alignItems: 'center' }}>
          <Text role="label" style={{ color: theme.colors.error }}>
            Remove from organization
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
