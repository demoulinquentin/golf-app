import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getTournament = baseProcedure
  .input(z.object({ tournamentId: z.number() }))
  .query(async ({ input }) => {
    const tournament = await db.tournament.findUnique({
      where: { id: input.tournamentId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        teams: {
          include: {
            players: {
              include: {
                player: true,
              },
            },
          },
        },
        rounds: {
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
            teams: {
              include: {
                players: {
                  include: {
                    player: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!tournament) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tournament not found",
      });
    }

    return tournament;
  });
