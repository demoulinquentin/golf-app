import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyAuth } from "./verifyAuth";

export const getUserRounds = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    const user = await verifyAuth(input.authToken);

    const rounds = await db.round.findMany({
      where: {
        creatorId: user.id,
      },
      include: {
        players: {
          include: {
            player: true,
          },
        },
        tournament: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10, // Limit to 10 most recent rounds
    });

    return rounds;
  });
