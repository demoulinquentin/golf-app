import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyAuth } from "./verifyAuth";

export const getUserTournaments = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    const user = await verifyAuth(input.authToken);

    const tournaments = await db.tournament.findMany({
      where: {
        creatorId: user.id,
      },
      include: {
        rounds: {
          include: {
            players: {
              include: {
                player: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10, // Limit to 10 most recent tournaments
    });

    return tournaments;
  });
