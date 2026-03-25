import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { verifyAuth } from "./verifyAuth";
import {
  GameType,
  CourseFormat,
  MatchupFormat,
  SegmentConfig,
  TournamentRulesJson,
  validateMatchupCompatibility,
  generateSegmentsFromFormat,
} from "~/server/types/tournament";
import { generateUniqueJoinCode, validateCourseJson } from "~/server/utils/courseData";

const teamConfigSchema = z.object({
  name: z.string(),
  color: z.string().default("#059669"),
  playerIndices: z.array(z.number()), // Indices of players in this team
});

const playerMatchupSchema: z.ZodType<any> = z.lazy(() => 
  z.union([
    z.object({
      format: z.literal("foursomes"),
      matches: z.array(z.object({
        team1PlayerIndices: z.tuple([z.number(), z.number()]),
        team2PlayerIndices: z.tuple([z.number(), z.number()]),
      })),
    }),
    z.object({
      format: z.literal("fourball"),
      matches: z.array(z.object({
        team1PlayerIndices: z.tuple([z.number(), z.number()]),
        team2PlayerIndices: z.tuple([z.number(), z.number()]),
      })),
    }),
    z.object({
      format: z.literal("singles"),
      matches: z.array(z.object({
        player1Index: z.number(),
        player2Index: z.number(),
      })),
    }),
    z.object({
      format: z.literal("2v2"),
      team1PlayerIndices: z.tuple([z.number(), z.number()]),
      team2PlayerIndices: z.tuple([z.number(), z.number()]),
    }),
    z.object({
      format: z.literal("1v1+1v1"),
      match1: z.tuple([z.number(), z.number()]),
      match2: z.tuple([z.number(), z.number()]),
    }),
    z.object({
      format: z.literal("individual"),
      playerIndices: z.array(z.number()),
    }),
    z.object({
      format: z.literal("flexible"),
      matches: z.array(z.object({
        sides: z.array(z.array(z.number())),
      })),
    }),
  ])
);

const matchupFormatSchema = z.union([
  z.object({
    type: z.literal("2v2"),
    teams: z.tuple([
      z.tuple([z.number(), z.number()]),
      z.tuple([z.number(), z.number()]),
    ]),
  }),
  z.object({
    type: z.literal("1v1+1v1"),
    pairs: z.tuple([
      z.tuple([z.number(), z.number()]),
      z.tuple([z.number(), z.number()]),
    ]),
  }),
  z.object({
    type: z.literal("individual"),
  }),
  z.object({
    type: z.literal("flexible"),
    playerMatchup: playerMatchupSchema,
  }),
]);

const segmentConfigSchema = z.object({
  segmentNumber: z.number(),
  gameType: z.nativeEnum(GameType),
  matchupFormat: matchupFormatSchema,
});

const roundConfigSchema = z.object({
  name: z.string(),
  courseName: z.string(),
  courseFormat: z.nativeEnum(CourseFormat).default(CourseFormat.EIGHTEEN),
  courseJson: z.string().optional(), // JSON string with course data
  segments: z.array(segmentConfigSchema).optional(),
  gameTemplateId: z.number().optional(),
  rulesJson: z.any().optional(),
  teams: z.array(teamConfigSchema).optional(),
});

export const createTournament = baseProcedure
  .input(
    z.object({
      authToken: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      players: z.array(
        z.object({
          name: z.string(),
          handicap: z.number().default(0),
        })
      ),
      rounds: z.array(roundConfigSchema),
      globalTeams: z.array(teamConfigSchema).optional(), // Teams that persist across all rounds
    })
  )
  .mutation(async ({ input }) => {
    let userId: number;
    
    // If authToken provided, verify user
    if (input.authToken) {
      const user = await verifyAuth(input.authToken);
      userId = user.id;
    } else {
      // Create a temporary guest user
      const guestUser = await db.user.create({
        data: {
          email: `guest_${Date.now()}@golfapp.local`,
          password: "guest", // Not used for guest accounts
          name: "Guest User",
        },
      });
      userId = guestUser.id;
    }

    // Validate segment configurations for each round
    for (const roundConfig of input.rounds) {
      if (roundConfig.segments && roundConfig.segments.length > 0) {
        const playerCount = input.players.length;
        
        for (const segment of roundConfig.segments) {
          const validation = validateMatchupCompatibility(
            segment.gameType,
            segment.matchupFormat,
            playerCount
          );
          
          if (!validation.valid) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid configuration for segment ${segment.segmentNumber}: ${validation.error}`,
            });
          }
        }
      }
    }

    // Create players first (they're shared across all rounds in the tournament)
    const playerIds: number[] = [];
    for (const playerData of input.players) {
      const player = await db.player.create({
        data: {
          name: playerData.name,
          handicap: playerData.handicap,
          userId: userId,
        },
      });
      playerIds.push(player.id);
    }

    // Generate unique join code
    const joinCode = await generateUniqueJoinCode(db);

    // Create the tournament
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

    // Create global teams if specified
    const globalTeamIds: { [key: string]: number } = {};
    if (input.globalTeams) {
      for (const teamConfig of input.globalTeams) {
        const team = await db.team.create({
          data: {
            name: teamConfig.name,
            color: teamConfig.color,
            tournamentId: tournament.id,
          },
        });
        globalTeamIds[teamConfig.name] = team.id;
      }
    }

    // Create each round
    const roundIds: number[] = [];
    for (const roundConfig of input.rounds) {
      // Create rule set from segment configuration or custom rules
      let ruleSetId: number | undefined;
      if (roundConfig.segments && roundConfig.segments.length > 0) {
        // Generate rulesJson from segment configuration
        const holeSegments = generateSegmentsFromFormat(roundConfig.courseFormat);
        const rulesJson: TournamentRulesJson = {
          courseFormat: roundConfig.courseFormat,
          segments: roundConfig.segments.map((seg, idx) => ({
            ...seg,
            holes: holeSegments[idx] || [],
          })),
          holes: [],
        };
        
        // Generate per-hole rules
        roundConfig.segments.forEach((segment, segmentIdx) => {
          const holes = holeSegments[segmentIdx] || [];
          holes.forEach((holeNumber) => {
            rulesJson.holes.push({
              number: holeNumber,
              segmentNumber: segment.segmentNumber,
              gameType: segment.gameType,
              matchupFormat: segment.matchupFormat,
            });
          });
        });
        
        const ruleSet = await db.ruleSet.create({
          data: { rulesJson: rulesJson as any },
        });
        ruleSetId = ruleSet.id;
      } else if (roundConfig.rulesJson) {
        // Use custom rules if provided
        const ruleSet = await db.ruleSet.create({
          data: { rulesJson: roundConfig.rulesJson },
        });
        ruleSetId = ruleSet.id;
      }

      // Parse course JSON if provided
      let courseData: any = null;
      let coursePar = 72; // Default
      
      if (roundConfig.courseJson) {
        try {
          const parsed = validateCourseJson(roundConfig.courseJson);
          courseData = parsed.holes;
          coursePar = parsed.holes.reduce((sum, hole) => sum + hole.par, 0);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid course JSON for round "${roundConfig.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      }

      // Create the round
      const round = await db.round.create({
        data: {
          name: roundConfig.name,
          courseName: roundConfig.courseName,
          creatorId: userId,
          tournamentId: tournament.id,
          gameTemplateId: roundConfig.gameTemplateId,
          ruleSetId: ruleSetId,
          status: "setup",
          coursePar: coursePar,
          holeData: courseData,
        },
      });
      roundIds.push(round.id);

      // Create round-specific teams or use global teams
      const roundTeamIds: { [key: string]: number } = {};
      if (roundConfig.teams) {
        for (const teamConfig of roundConfig.teams) {
          const team = await db.team.create({
            data: {
              name: teamConfig.name,
              color: teamConfig.color,
              roundId: round.id,
            },
          });
          roundTeamIds[teamConfig.name] = team.id;
        }
      }

      // Link players to round
      for (let i = 0; i < playerIds.length; i++) {
        let teamId: number | undefined;
        
        // Determine team assignment
        if (roundConfig.teams) {
          // Round-specific teams
          const playerTeam = roundConfig.teams.find(t => 
            t.playerIndices.includes(i)
          );
          if (playerTeam) {
            teamId = roundTeamIds[playerTeam.name];
          }
        } else if (input.globalTeams) {
          // Global teams
          const playerTeam = input.globalTeams.find(t => 
            t.playerIndices.includes(i)
          );
          if (playerTeam) {
            teamId = globalTeamIds[playerTeam.name];
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
    }

    return {
      tournamentId: tournament.id,
      roundIds,
      shareableLink: tournament.shareableLink,
      joinCode: tournament.joinCode,
    };
  });
