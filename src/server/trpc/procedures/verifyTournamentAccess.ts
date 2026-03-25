import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";

type TournamentAccessInput = {
  tournamentId: number;
  requestingPlayerId?: number | null;
  isAdmin?: boolean;
};

export async function verifyTournamentAccess(input: TournamentAccessInput) {
  const tournament = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      creator: true,
    },
  });

  if (!tournament) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Tournament not found",
    });
  }

  return {
    tournament,
    isAdmin: input.isAdmin || false,
    playerId: input.requestingPlayerId || null,
  };
}

type RoundAccessInput = {
  roundId: number;
  requestingPlayerId?: number | null;
  isAdmin?: boolean;
};

export async function verifyRoundAccess(input: RoundAccessInput) {
  const round = await db.round.findUnique({
    where: { id: input.roundId },
    include: {
      creator: true,
      tournament: true,
      players: {
        include: {
          player: true,
        },
      },
    },
  });

  if (!round) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Round not found",
    });
  }

  // Check if requesting player is in the round
  const playerInRound = input.requestingPlayerId
    ? round.players.some(rp => rp.playerId === input.requestingPlayerId)
    : false;

  return {
    round,
    isAdmin: input.isAdmin || false,
    playerId: input.requestingPlayerId || null,
    playerInRound,
  };
}

export function canEditScore(
  isAdmin: boolean,
  requestingPlayerId: number | null,
  scorePlayerId: number
): boolean {
  // Admin can edit any score
  if (isAdmin) return true;
  
  // Player can only edit their own score
  return requestingPlayerId === scorePlayerId;
}
