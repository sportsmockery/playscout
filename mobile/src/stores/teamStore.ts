import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserRole } from '@/types/domain';

export interface ActiveTeam {
  id: string;
  name: string;
  ageGroup?: string | null;
  level?: string | null;
  role: UserRole | null;
}

interface TeamState {
  activeTeam: ActiveTeam | null;
  setActiveTeam: (team: ActiveTeam | null) => void;
  clear: () => void;
}

/**
 * The active team is global. Persisted so the app reopens on the last team.
 * Server-side team ID validation is always authoritative — this is a UI
 * convenience only. Changing teams invalidates team-scoped queries (handled by
 * the team switcher, which owns the QueryClient).
 */
export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      activeTeam: null,
      setActiveTeam: (team) => set({ activeTeam: team }),
      clear: () => set({ activeTeam: null }),
    }),
    {
      name: 'playscout.activeTeam',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
