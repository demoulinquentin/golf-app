import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getRound = baseProcedure
  .input(z.object({ roundId: z.number() }))
  .query(async ({ input }) => {
    const round = await db.round.findUnique({
      where: { id: input.roundId },
      include: {
        players: {
          include: {
            player: true,
            team: true,
          },
          orderBy: { position: "asc" },
        },
        scores: {
          include: {
            player: true,
          },
        },
        ruleSet: true,
        gameTemplate: {
          include: {
            ruleSet: true,
          },
        },
        brandingConfig: true,
      },
    });

    if (!round) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Round not found",
      });
    }

    return round;
  });
