import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyRoundAccess } from "./verifyTournamentAccess";

export const deleteRound = baseProcedure
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

    // Only admin can delete rounds
    if (!isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the tournament admin can delete rounds",
      });
    }

    // Delete the round (cascade will handle related records)
    await db.round.delete({
      where: { id: input.roundId },
    });

    return {
      success: true,
    };
  });
