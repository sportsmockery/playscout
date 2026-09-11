import React, { useState } from 'react';
import { View } from 'react-native';
import { Text, Card, Section, Button, Field, ChipSelect } from '@/components';
import { AGE_GROUPS, LEVELS, GAME_TYPES } from './constants';
import type { GameType } from '@/types/domain';
import type { TeamFormValues } from './form';

export * from './form';

/**
 * The team form, shared by create and settings so the two cannot drift into
 * offering different fields for the same row.
 */
export function TeamForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  mode,
}: {
  values: TeamFormValues;
  onChange: (v: TeamFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  mode: 'create' | 'edit';
}) {
  const [showMore, setShowMore] = useState(mode === 'edit');
  const set = <K extends keyof TeamFormValues>(k: K) => (val: TeamFormValues[K]) =>
    onChange({ ...values, [k]: val });

  return (
    <>
      <Section title="The basics" style={{ marginTop: 12 }}>
        <Card>
          <Field
            label="Team name"
            value={values.name}
            onChangeText={set('name')}
            autoCapitalize="words"
            placeholder="Bulldogs"
          />
          <ChipSelect
            label="Age group"
            options={AGE_GROUPS.map((a) => ({ value: a, label: a }))}
            value={values.age_group}
            onChange={set('age_group')}
          />
          <Field label="Season" value={values.season} onChangeText={set('season')} placeholder="2026" />
        </Card>
      </Section>

      {/* Safety-relevant, so it is never buried behind "more". */}
      <Section title="How this team plays">
        <Card>
          <ChipSelect<GameType>
            label="Game type"
            options={GAME_TYPES.map((g) => ({ value: g.value, label: g.label }))}
            value={values.game_type}
            onChange={set('game_type')}
            hint={
              GAME_TYPES.find((g) => g.value === values.game_type)?.hint ??
              'Decides whether contact drills can ever be recommended for this team.'
            }
          />
          <ChipSelect
            label="Level"
            options={LEVELS.map((l) => ({ value: l, label: l }))}
            value={values.level}
            onChange={set('level')}
            hint="Grading calibrates to the level — youth on fundamentals, varsity on next-level standards."
          />
        </Card>
      </Section>

      <Section title="Jersey colours">
        <Card>
          <Text role="metadata" color="textSecondary" style={{ marginBottom: 10 }}>
            Analysis uses these to tell your players from the other team.
          </Text>
          <Field
            label="Home jersey"
            value={values.home_jersey_color}
            onChangeText={set('home_jersey_color')}
            autoCapitalize="none"
            placeholder="navy with gold numbers"
          />
          <Field
            label="Away jersey"
            value={values.away_jersey_color}
            onChangeText={set('away_jersey_color')}
            autoCapitalize="none"
            placeholder="white with navy numbers"
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>
      </Section>

      {showMore ? (
        <Section title="Scheme and league">
          <Card>
            <Field
              label="Offensive style"
              value={values.offensive_style}
              onChangeText={set('offensive_style')}
              placeholder="Double wing"
            />
            <Field
              label="Defensive style"
              value={values.defensive_style}
              onChangeText={set('defensive_style')}
              placeholder="5-3"
            />
            <Field label="League" value={values.league} onChangeText={set('league')} />
            <Field
              label="State"
              value={values.state}
              onChangeText={set('state')}
              autoCapitalize="characters"
              maxLength={2}
              placeholder="IL"
            />
            <Field
              label="Notes"
              value={values.notes}
              onChangeText={set('notes')}
              multiline
              numberOfLines={3}
              style={{ minHeight: 88, paddingTop: 12 }}
              containerStyle={{ marginBottom: 0 }}
            />
          </Card>
        </Section>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Button label="Add scheme and league details" variant="secondary" onPress={() => setShowMore(true)} />
        </View>
      )}

      <View style={{ marginTop: 20, marginBottom: 24 }}>
        <Button
          label={submitLabel}
          onPress={onSubmit}
          loading={busy}
          disabled={busy || values.name.trim() === ''}
        />
        {values.name.trim() === '' ? (
          <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 8 }}>
            A team name is required.
          </Text>
        ) : null}
      </View>
    </>
  );
}
