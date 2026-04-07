import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const updateRoundCourse = baseProcedure
  .input(
    z.object({
      tournamentId: z.number(),
      roundId: z.number(),
      courseName: z.string(),
      holeData: z.array(
        z.object({
          hole: z.number().int().min(1).max(18),
          par: z.number().int().min(3).max(6),
          strokeIndex: z.number().int().min(1).max(18),
        })
      ).length(18),
      isAdmin: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Only admin can update course
    if (!input.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the tournament admin can update the course",
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

    // Calculate total par
    const totalPar = input.holeData.reduce((sum, h) => sum + h.par, 0);

    // Update the round's course data
    const updated = await db.round.update({
      where: { id: input.roundId },
      data: {
        courseName: input.courseName,
        holeData: input.holeData,
        coursePar: totalPar,
      },
    });

    return updated;
  });
