import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyAuth } from "./verifyAuth";
import {
  GameType,
  CourseFormat,
  validateTeamCupDay2Matches,
  TeamCupMatch,
} from "~/server/types/tournament";
import { generateUniqueJoinCode, validateCourseJson } from "~/server/utils/courseData";

const teamCupMatchSchema = z.object({
  segmentNumber: z.number().int().min(1).max(3),
  player1Index: z.number().int().min(0).max(5),
  player2Index: z.number().int().min(0).max(5),
  type: z.enum(["within-party", "blind"]),
});

const teamCupInputSchema = z.object({
  authToken: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  teams: z.tuple([
    z.object({
      name: z.string(),
      color: z.string(),
      players: z.tuple([
        z.object({ name: z.string(), handicap: z.number() }),
        z.object({ name: z.string(), handicap: z.number() }),
        z.object({ name: z.string(), handicap: z.number() }),
      ]),
    }),
    z.object({
      name: z.string(),
      color: z.string(),
      players: z.tuple([
        z.object({ name: z.string(), handicap: z.number() }),
        z.object({ name: z.string(), handicap: z.number() }),
        z.object({ name: z.string(), handicap: z.number() }),
      ]),
    }),
  ]),
  day1: z.object({
    courseName: z.string(),
    courseJson: z.string().optional(),
  }),
  day2: z.object({
    courseName: z.string(),
    courseJson: z.string().optional(),
    party1: z.tuple([z.number(), z.number(), z.number()]),
    party2: z.tuple([z.number(), z.number(), z.number()]),
    matches: z.array(teamCupMatchSchema),
  }),
  day3: z.object({
    courseName: z.string(),
    courseJson: z.string().optional(),
    party1: z.tuple([z.number(), z.number(), z.number()]),
    party2: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

export const createTeamCupTournament = baseProcedure
  .input(teamCupInputSchema)
  .mutation(async ({ input }) => {
    let userId: number;

    // Verify user or create guest
    if (input.authToken) {
      const user = await verifyAuth(input.authToken);
      userId = user.id;
    } else {
      const guestUser = await db.user.create({
        data: {
          email: `guest_${Date.now()}@golfapp.local`,
          password: "guest",
          name: "Guest User",
        },
      });
      userId = guestUser.id;
    }

    // Validate Day 2 matches
    const team1Indices = [0, 1, 2];
    const team2Indices = [3, 4, 5];
    const matchesWithIds: TeamCupMatch[] = input.day2.matches.map((m, idx) => ({
      id: `match-${idx}`,
      segmentNumber: m.segmentNumber,
      player1Index: m.player1Index,
      player2Index: m.player2Index,
      type: m.type,
    }));

    const validation = validateTeamCupDay2Matches(matchesWithIds, team1Indices, team2Indices);
    if (!validation.valid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid Day 2 match configuration: ${validation.error}`,
      });
    }

    // Create all 6 players
    const playerIds: number[] = [];
    for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
      for (let playerIdx = 0; playerIdx < 3; playerIdx++) {
        const playerData = input.teams[teamIdx].players[playerIdx];
        const player = await db.player.create({
          data: {
            name: playerData.name,
            handicap: playerData.handicap,
            userId: userId,
          },
        });
        playerIds.push(player.id);
      }
    }

    // Generate join code
    const joinCode = await generateUniqueJoinCode(db);

    // Create tournament
    const tournament = await db.tournament.create({
      data: {
        name: input.name,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        creatorId: userId,
        status: "setup",
        joinCode: joinCode,
      },
    });

    // Create global teams
    const team1 = await db.team.create({
      data: {
        name: input.teams[0].name,
        color: input.teams[0].color,
        tournamentId: tournament.id,
      },
    });

    const team2 = await db.team.create({
      data: {
        name: input.teams[1].name,
        color: input.teams[1].color,
        tournamentId: tournament.id,
      },
    });

    // Helper to parse course JSON
    const parseCourseData = (courseJson?: string) => {
      if (!courseJson) return { courseData: null, coursePar: 72 };
      
      try {
        const parsed = validateCourseJson(courseJson);
        const courseData = parsed.holes;
        const coursePar = parsed.holes.reduce((sum, hole) => sum + hole.par, 0);
        return { courseData, coursePar };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid course JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    };

    // Create Day 1 Round (Individual Net Strokeplay)
    const day1Course = parseCourseData(input.day1.courseJson);
    const day1RulesJson = {
      courseFormat: CourseFormat.EIGHTEEN,
      segments: [
        {
          segmentNumber: 1,
          holes: Array.from({ length: 18 }, (_, i) => i + 1),
          gameType: GameType.LEADERBOARD_NET,
          matchupFormat: {
            type: "individual" as const,
          },
        },
      ],
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        segmentNumber: 1,
        gameType: GameType.LEADERBOARD_NET,
        matchupFormat: {
          type: "individual" as const,
        },
      })),
    };

    const day1RuleSet = await db.ruleSet.create({
      data: { rulesJson: day1RulesJson as any },
    });

    const day1Round = await db.round.create({
      data: {
        name: "Day 1 — Leaderboard",
        courseName: input.day1.courseName,
        creatorId: userId,
        tournamentId: tournament.id,
        ruleSetId: day1RuleSet.id,
        status: "setup",
        coursePar: day1Course.coursePar,
        holeData: day1Course.courseData,
      },
    });

    // Link all players to Day 1 (same-team parties)
    for (let i = 0; i < 6; i++) {
      const teamId = i < 3 ? team1.id : team2.id;
      await db.roundPlayer.create({
        data: {
          roundId: day1Round.id,
          playerId: playerIds[i],
          position: i,
          teamId: teamId,
        },
      });
    }

    // Create Day 2 Round (6-hole Matchplay)
    const day2Course = parseCourseData(input.day2.courseJson);
    const day2RulesJson = {
      courseFormat: CourseFormat.SIX_X_THREE,
      segments: [1, 2, 3].map((segNum) => ({
        segmentNumber: segNum,
        holes: Array.from({ length: 6 }, (_, i) => (segNum - 1) * 6 + i + 1),
        gameType: GameType.MATCHPLAY_6HOLE,
        matchupFormat: {
          type: "flexible" as const,
          playerMatchup: {
            format: "singles" as const,
            matches: input.day2.matches
              .filter((m) => m.segmentNumber === segNum)
              .map((m) => ({
                player1Index: m.player1Index,
                player2Index: m.player2Index,
              })),
          },
        },
      })),
      holes: Array.from({ length: 18 }, (_, i) => {
        const holeNumber = i + 1;
        const segmentNumber = Math.ceil(holeNumber / 6);
        return {
          number: holeNumber,
          segmentNumber: segmentNumber,
          gameType: GameType.MATCHPLAY_6HOLE,
          matchupFormat: {
            type: "flexible" as const,
            playerMatchup: {
              format: "singles" as const,
              matches: input.day2.matches
                .filter((m) => m.segmentNumber === segmentNumber)
                .map((m) => ({
                  player1Index: m.player1Index,
                  player2Index: m.player2Index,
                })),
            },
          },
        };
      }),
      day2Config: {
        party1PlayerIndices: input.day2.party1,
        party2PlayerIndices: input.day2.party2,
        matches: matchesWithIds,
      },
    };

    const day2RuleSet = await db.ruleSet.create({
      data: { rulesJson: day2RulesJson as any },
    });

    const day2Round = await db.round.create({
      data: {
        name: "Day 2 — Matchplay",
        courseName: input.day2.courseName,
        creatorId: userId,
        tournamentId: tournament.id,
        ruleSetId: day2RuleSet.id,
        status: "setup",
        coursePar: day2Course.coursePar,
        holeData: day2Course.courseData,
      },
    });

    // Link all players to Day 2
    for (let i = 0; i < 6; i++) {
      const teamId = i < 3 ? team1.id : team2.id;
      await db.roundPlayer.create({
        data: {
          roundId: day2Round.id,
          playerId: playerIds[i],
          position: i,
          teamId: teamId,
        },
      });
    }

    // Create Day 3 Round (Best Ball Team)
    const day3Course = parseCourseData(input.day3.courseJson);
    const day3RulesJson = {
      courseFormat: CourseFormat.EIGHTEEN,
      segments: [
        {
          segmentNumber: 1,
          holes: Array.from({ length: 18 }, (_, i) => i + 1),
          gameType: GameType.BEST_BALL_TEAM,
          matchupFormat: {
            type: "individual" as const,
          },
        },
      ],
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        segmentNumber: 1,
        gameType: GameType.BEST_BALL_TEAM,
        matchupFormat: {
          type: "individual" as const,
        },
      })),
      day3Config: {
        party1PlayerIndices: input.day3.party1,
        party2PlayerIndices: input.day3.party2,
      },
    };

    const day3RuleSet = await db.ruleSet.create({
      data: { rulesJson: day3RulesJson as any },
    });

    const day3Round = await db.round.create({
      data: {
        name: "Day 3 — Best Ball",
        courseName: input.day3.courseName,
        creatorId: userId,
        tournamentId: tournament.id,
        ruleSetId: day3RuleSet.id,
        status: "setup",
        coursePar: day3Course.coursePar,
        holeData: day3Course.courseData,
      },
    });

    // Link all players to Day 3
    for (let i = 0; i < 6; i++) {
      const teamId = i < 3 ? team1.id : team2.id;
      await db.roundPlayer.create({
        data: {
          roundId: day3Round.id,
          playerId: playerIds[i],
          position: i,
          teamId: teamId,
        },
      });
    }

    return {
      tournamentId: tournament.id,
      joinCode: joinCode,
      roundIds: [day1Round.id, day2Round.id, day3Round.id],
    };
  });
