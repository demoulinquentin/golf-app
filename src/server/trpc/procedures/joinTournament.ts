import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const joinTournament = baseProcedure
  .input(
    z.object({
      shareableLink: z.string(),
      playerId: z.number().optional(), // Optional - user might just be viewing
    })
  )
  .query(async ({ input }) => {
    // Find tournament by shareable link
    const tournament = await db.tournament.findUnique({
      where: { shareableLink: input.shareableLink },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        rounds: {
          include: {
            players: {
              include: {
                player: true,
              },
              orderBy: { position: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!tournament) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tournament not found. Please check the link and try again.",
      });
    }

    // Get all unique players across all rounds
    const playerMap = new Map<number, { id: number; name: string; handicap: number }>();
    
    for (const round of tournament.rounds) {
      for (const roundPlayer of round.players) {
        if (!playerMap.has(roundPlayer.player.id)) {
          playerMap.set(roundPlayer.player.id, {
            id: roundPlayer.player.id,
            name: roundPlayer.player.name,
            handicap: roundPlayer.player.handicap,
          });
        }
      }
    }

    const players = Array.from(playerMap.values());

    // If playerId is provided, validate it exists
    if (input.playerId !== undefined) {
      const playerExists = players.some(p => p.id === input.playerId);
      if (!playerExists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected player not found in this tournament.",
        });
      }
    }

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        status: tournament.status,
        creatorId: tournament.creatorId,
      },
      players,
      selectedPlayerId: input.playerId,
    };
  });
