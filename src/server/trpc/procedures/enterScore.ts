import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { emitScoreUpdate } from "./subscribeToRoundScores";
import { canEditScore } from "./verifyTournamentAccess";

export const enterScore = baseProcedure
  .input(
    z.object({
      roundId: z.number(),
      playerId: z.number(),
      holeNumber: z.number().min(1).max(18),
      strokes: z.number().min(1),
      putts: z.number().optional(),
      fairwayHit: z.boolean().optional(),
      greenInReg: z.boolean().optional(),
      // Permission parameters
      requestingPlayerId: z.number().optional(),
      isAdmin: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Check permissions — any tournament participant can edit any score
    if (!input.isAdmin && !input.requestingPlayerId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You must be a tournament participant to edit scores",
      });
    }

    // Check if this is the first score for the round
    const existingScores = await db.score.count({
      where: { roundId: input.roundId },
    });

    // Upsert score (create or update)
    const score = await db.score.upsert({
      where: {
        roundId_playerId_holeNumber: {
          roundId: input.roundId,
          playerId: input.playerId,
          holeNumber: input.holeNumber,
        },
      },
      create: {
        roundId: input.roundId,
        playerId: input.playerId,
        holeNumber: input.holeNumber,
        strokes: input.strokes,
        putts: input.putts,
        fairwayHit: input.fairwayHit,
        greenInReg: input.greenInReg,
      },
      update: {
        strokes: input.strokes,
        putts: input.putts,
        fairwayHit: input.fairwayHit,
        greenInReg: input.greenInReg,
      },
    });

    // Get the round
    const round = await db.round.findUnique({
      where: { id: input.roundId },
    });

    if (round) {
      // If this is the first score and round is in setup, transition to in_progress
      if (existingScores === 0 && round.status === "setup") {
        await db.round.update({
          where: { id: input.roundId },
          data: { 
            status: "in_progress",
            startedAt: new Date(),
          },
        });
      }

      // Update round's current hole if this is the furthest hole scored
      if (input.holeNumber >= round.currentHole) {
        await db.round.update({
          where: { id: input.roundId },
          data: { currentHole: Math.min(input.holeNumber + 1, 18) },
        });
      }
    }

    // Emit score update event for real-time subscriptions
    emitScoreUpdate(input.roundId);

    return score;
  });
