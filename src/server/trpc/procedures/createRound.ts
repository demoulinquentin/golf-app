import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyAuth } from "./verifyAuth";
import { validateCourseJson } from "~/server/utils/courseData";
import { TRPCError } from "@trpc/server";

export const createRound = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      name: z.string(),
      courseName: z.string(),
      courseJson: z.string().optional(), // JSON string with course data
      players: z.array(
        z.object({
          name: z.string(),
          handicap: z.number().default(0),
        })
      ),
      gameTemplateId: z.number().optional(),
      rulesJson: z.any().optional(),
      teams: z.array(
        z.object({
          name: z.string(),
          color: z.string().default("#059669"),
          playerIndices: z.array(z.number()),
        })
      ).optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await verifyAuth(input.authToken);

    // Parse course JSON if provided
    let courseData: any = null;
    let coursePar = 72; // Default
    
    if (input.courseJson) {
      try {
        const parsed = validateCourseJson(input.courseJson);
        courseData = parsed.holes;
        coursePar = parsed.holes.reduce((sum, hole) => sum + hole.par, 0);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid course JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }

    // Create rule set if custom rules provided
    let ruleSetId: number | undefined;
    if (input.rulesJson) {
      const ruleSet = await db.ruleSet.create({
        data: { rulesJson: input.rulesJson },
      });
      ruleSetId = ruleSet.id;
    }

    // Create players
    const playerIds: number[] = [];
    for (const playerData of input.players) {
      const player = await db.player.create({
        data: {
          name: playerData.name,
          handicap: playerData.handicap,
          userId: user.id,
        },
      });
      playerIds.push(player.id);
    }

    // Create round
    const round = await db.round.create({
      data: {
        name: input.name,
        courseName: input.courseName,
        creatorId: user.id,
        gameTemplateId: input.gameTemplateId,
        ruleSetId: ruleSetId,
        status: "setup",
        coursePar: coursePar,
        holeData: courseData,
      },
    });

    // Create teams if specified
    const teamIds: { [key: string]: number } = {};
    if (input.teams) {
      for (const teamConfig of input.teams) {
        const team = await db.team.create({
          data: {
            name: teamConfig.name,
            color: teamConfig.color,
            roundId: round.id,
          },
        });
        teamIds[teamConfig.name] = team.id;
      }
    }

    // Link players to round with team assignments
    for (let i = 0; i < playerIds.length; i++) {
      let teamId: number | undefined;
      
      // Find which team this player belongs to
      if (input.teams) {
        const playerTeam = input.teams.find(t => 
          t.playerIndices.includes(i)
        );
        if (playerTeam) {
          teamId = teamIds[playerTeam.name];
        }
      }

      await db.roundPlayer.create({
        data: {
          roundId: round.id,
          playerId: playerIds[i],
          position: i,
          teamId: teamId,
        },
      });
    }

    return {
      roundId: round.id,
      shareableId: round.shareableId,
    };
  });
