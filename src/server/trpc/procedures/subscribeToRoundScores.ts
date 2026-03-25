import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { EventEmitter } from "events";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

// Event emitter for broadcasting score updates
const scoreUpdateEmitter = new EventEmitter();

export function emitScoreUpdate(roundId: number) {
  scoreUpdateEmitter.emit(`score-update-${roundId}`, { roundId, timestamp: Date.now() });
}

export const subscribeToRoundScores = baseProcedure
  .input(z.object({ roundId: z.number() }))
  .subscription(async function* ({ input }) {
    // Verify round exists
    const round = await db.round.findUnique({
      where: { id: input.roundId },
    });

    if (!round) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Round not found",
      });
    }

    // Send initial data
    const initialData = await db.round.findUnique({
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
    });

    yield initialData;

    // Listen for updates
    const eventName = `score-update-${input.roundId}`;
    
    while (true) {
      // Wait for next update event
      await new Promise<void>((resolve) => {
        scoreUpdateEmitter.once(eventName, () => resolve());
      });

      // Fetch and yield updated data
      const updatedData = await db.round.findUnique({
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
      });

      if (updatedData) {
        yield updatedData;
      }
    }
  });
