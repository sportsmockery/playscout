import { emptyTeamForm, teamFormFrom, toTeamInput } from '@/features/teams/form';
import { GAME_TYPES, AGE_GROUPS, LEVELS } from '@/features/teams/constants';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/utils/roles';
import type { Team } from '@/types/domain';

describe('team form', () => {
  it('round-trips a team row without losing a field', () => {
    const team: Team = {
      id: 't1',
      name: 'Bulldogs',
      age_group: '10U',
      season: '2026',
      level: 'Travel',
      game_type: 'tackle',
      league: 'NIYFL',
      state: 'IL',
      offensive_style: 'Double wing',
      defensive_style: '5-3',
      home_jersey_color: 'navy',
      away_jersey_color: 'white',
      notes: 'nothing',
      created_at: 'now',
    };
    expect(toTeamInput(teamFormFrom(team))).toMatchObject({
      name: 'Bulldogs',
      age_group: '10U',
      game_type: 'tackle',
      home_jersey_color: 'navy',
      notes: 'nothing',
    });
  });

  it('turns a null field into an empty string rather than the text "null"', () => {
    const team = {
      id: 't1',
      name: 'Bulldogs',
      age_group: null,
      game_type: null,
      notes: null,
      created_at: 'now',
    } as Team;
    const form = teamFormFrom(team);
    expect(form.age_group).toBe('');
    expect(form.game_type).toBe('');
    expect(form.notes).toBe('');
  });

  it('defaults a new team to the current season', () => {
    expect(emptyTeamForm().season).toBe(String(new Date().getFullYear()));
  });

  it('starts a new team with no game type, so nothing is assumed about contact', () => {
    expect(emptyTeamForm().game_type).toBe('');
  });
});

describe('team option sets', () => {
  /**
   * game_type gates every contact-drill recommendation. A value the server's
   * check rejects would be saved as a silent no-op, so the sets must agree.
   */
  it('offers exactly the three game types the server accepts', () => {
    expect(GAME_TYPES.map((g) => g.value).sort()).toEqual(
      ['flag', 'rookie_tackle', 'tackle'].sort(),
    );
  });

  it('says plainly that flag means no contact', () => {
    expect(GAME_TYPES.find((g) => g.value === 'flag')?.hint).toMatch(/no contact/i);
  });

  it('covers youth through varsity', () => {
    expect(AGE_GROUPS).toContain('6U');
    expect(AGE_GROUPS).toContain('Varsity');
    expect(LEVELS).toContain('High School');
  });
});

describe('assignable roles', () => {
  /** The members endpoint refuses to set or change owner, so offering it
   *  would only ever produce a rejected request. */
  it('never offers owner', () => {
    expect(ASSIGNABLE_ROLES).not.toContain('owner');
  });

  it('has a label for every role it offers', () => {
    for (const r of ASSIGNABLE_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
  });
});
