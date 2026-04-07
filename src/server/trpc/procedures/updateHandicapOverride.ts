import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const updateHandicapOverride = baseProcedure
  .input(
    z.object({
      tournamentId: z.number(),
      roundId: z.number(),
      playerId: z.number(),
      handicapOverride: z.number().nullable(),
      isAdmin: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Only admin can update handicap overrides
    if (!input.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the tournament admin can update handicap overrides",
      });
    }

    // Verify the round belongs to the tournament
    const round = await db.round.findUnique({
      where: { id: input.roundId },
    });

    if (!round || round.tournamentId !== input.tournamentId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Round not found in this tournament",
      });
    }

    // Update the RoundPlayer's handicapOverride
    const roundPlayer = await db.roundPlayer.findUnique({
      where: {
        roundId_playerId: {
          roundId: input.roundId,
          playerId: input.playerId,
        },
      },
    });

    if (!roundPlayer) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Player not found in this round",
      });
    }

    const updated = await db.roundPlayer.update({
      where: { id: roundPlayer.id },
      data: {
        handicapOverride: input.handicapOverride,
      },
      include: {
        player: true,
      },
    });

    return updated;
  });
