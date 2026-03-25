import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyRoundAccess } from "./verifyTournamentAccess";

export const completeRound = baseProcedure
  .input(z.object({ 
    roundId: z.number(),
    requestingPlayerId: z.number().optional(),
    isAdmin: z.boolean().optional(),
  }))
  .mutation(async ({ input }) => {
    // Verify round access
    const { round, isAdmin } = await verifyRoundAccess({
      roundId: input.roundId,
      requestingPlayerId: input.requestingPlayerId,
      isAdmin: input.isAdmin,
    });

    // Only admin can complete rounds
    if (!isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the tournament admin can complete rounds",
      });
    }

    // Check if already completed
    if (round.status === "completed") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Round is already completed",
      });
    }

    // Verify all players have entered all 18 hole scores
    const playerCount = round.players.length;
    const expectedScoreCount = playerCount * 18;
    const actualScoreCount = await db.score.count({
      where: { roundId: input.roundId },
    });

    if (actualScoreCount < expectedScoreCount) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot complete round: ${actualScoreCount} of ${expectedScoreCount} scores have been entered. All players must complete all 18 holes.`,
      });
    }

    // Update round status to completed
    await db.round.update({
      where: { id: input.roundId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  });
