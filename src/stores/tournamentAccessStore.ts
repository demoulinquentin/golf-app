import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type TournamentAccess = {
  tournamentId: number;
  playerId: number | null; // null if user is just viewing
  isAdmin: boolean; // true if user created this tournament
  playerName: string | null;
  joinedAt: Date;
};

type TournamentAccessStore = {
  // Map of tournamentId to access info
  tournaments: Record<number, TournamentAccess>;
  
  // Set player identity for a tournament
  setPlayerIdentity: (
    tournamentId: number,
    playerId: number,
    playerName: string,
    isAdmin: boolean
  ) => void;
  
  // Mark user as admin for a tournament
  setAsAdmin: (tournamentId: number) => void;
  
  // Get access info for a tournament
  getTournamentAccess: (tournamentId: number) => TournamentAccess | null;
  
  // Check if user is admin for a tournament
  isAdminFor: (tournamentId: number) => boolean;
  
  // Check if user can edit a specific player's scores
  canEditPlayer: (tournamentId: number, playerId: number) => boolean;
  
  // Clear access for a tournament
  clearTournamentAccess: (tournamentId: number) => void;
  
  // Clear all tournament access
  clearAll: () => void;
};

export const useTournamentAccessStore = create<TournamentAccessStore>()(
  persist(
    (set, get) => ({
      tournaments: {},
      
      setPlayerIdentity: (tournamentId, playerId, playerName, isAdmin) => {
        set((state) => ({
          tournaments: {
            ...state.tournaments,
            [tournamentId]: {
              tournamentId,
              playerId,
              isAdmin,
              playerName,
              joinedAt: new Date(),
            },
          },
        }));
      },
      
      setAsAdmin: (tournamentId) => {
        set((state) => ({
          tournaments: {
            ...state.tournaments,
            [tournamentId]: {
              ...state.tournaments[tournamentId],
              tournamentId,
              isAdmin: true,
              playerId: state.tournaments[tournamentId]?.playerId || null,
              playerName: state.tournaments[tournamentId]?.playerName || null,
              joinedAt: state.tournaments[tournamentId]?.joinedAt || new Date(),
            },
          },
        }));
      },
      
      getTournamentAccess: (tournamentId) => {
        return get().tournaments[tournamentId] || null;
      },
      
      isAdminFor: (tournamentId) => {
        return get().tournaments[tournamentId]?.isAdmin || false;
      },
      
      canEditPlayer: (tournamentId, playerId) => {
        const access = get().tournaments[tournamentId];
        if (!access) return false;
        
        // Admin can edit all players
        if (access.isAdmin) return true;
        
        // Player can only edit their own scores
        return access.playerId === playerId;
      },
      
      clearTournamentAccess: (tournamentId) => {
        set((state) => {
          const { [tournamentId]: _, ...rest } = state.tournaments;
          return { tournaments: rest };
        });
      },
      
      clearAll: () => {
        set({ tournaments: {} });
      },
    }),
    {
      name: "golf-tournament-access",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
