import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { GameType, TournamentRulesJson, calculateStablefordPoints } from "~/server/types/tournament";

export const getTournamentLeaderboard = baseProcedure
  .input(z.object({ tournamentId: z.number() }))
  .query(async ({ input }) => {
    const tournament = await db.tournament.findUnique({
      where: { id: input.tournamentId },
      include: {
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
            },
            scores: true,
            ruleSet: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tournament not found",
      });
    }

    // Helper to calculate score for a segment based on game type
    const calculateSegmentScore = (
      playerId: number,
      roundId: number,
      segmentHoles: number[],
      gameType: GameType
    ): number => {
      const segmentScores = tournament.rounds
        .find(r => r.id === roundId)
        ?.scores.filter(s => s.playerId === playerId && segmentHoles.includes(s.holeNumber)) || [];
      
      if (segmentScores.length === 0) return 0;
      
      if (gameType === GameType.STABLEFORD) {
        // For Stableford, sum up points (assuming par 4 for all holes)
        return segmentScores.reduce((sum, score) => {
          return sum + calculateStablefordPoints(score.strokes, 4, 0);
        }, 0);
      } else {
        // For Stroke Play and Scramble, sum up strokes
        return segmentScores.reduce((sum, score) => sum + score.strokes, 0);
      }
    };

    // Calculate individual scores with segment-aware logic
    const playerScores: {
      [playerId: number]: {
        player: { id: number; name: string; handicap: number };
        totalScore: number;
        totalGrossScore: number;
        totalPoints: number;
        roundsPlayed: number;
        teamId?: number;
        teamName?: string;
        roundScores: {
          roundId: number;
          roundName: string;
          grossScore: number;
          points: number;
        }[];
        segmentBreakdown: {
          roundId: number;
          roundName: string;
          segments: {
            segmentNumber: number;
            gameType: GameType;
            score: number;
            holes: number[];
          }[];
        }[];
      };
    } = {};

    for (const round of tournament.rounds) {
      const rulesJson = round.ruleSet?.rulesJson as TournamentRulesJson | undefined;
      
      for (const roundPlayer of round.players) {
        const playerId = roundPlayer.player.id;
        
        if (!playerScores[playerId]) {
          playerScores[playerId] = {
            player: {
              id: roundPlayer.player.id,
              name: roundPlayer.player.name,
              handicap: roundPlayer.player.handicap,
            },
            totalScore: 0,
            totalGrossScore: 0,
            totalPoints: 0,
            roundsPlayed: 0,
            teamId: roundPlayer.team?.id,
            teamName: roundPlayer.team?.name,
            roundScores: [],
            segmentBreakdown: [],
          };
        }

        const playerRoundScores = round.scores.filter(
          (s) => s.playerId === playerId
        );
        
        if (playerRoundScores.length > 0) {
          playerScores[playerId].roundsPlayed += 1;

          // Calculate gross score for this round
          const roundGrossScore = playerRoundScores.reduce(
            (sum, score) => sum + score.strokes,
            0
          );
          playerScores[playerId].totalGrossScore += roundGrossScore;
          playerScores[playerId].roundScores.push({
            roundId: round.id,
            roundName: round.name,
            grossScore: roundGrossScore,
            points: 0, // Will be calculated after all rounds are processed
          });

          // Calculate segment scores if rulesJson is available
          if (rulesJson?.segments) {
            const roundBreakdown = {
              roundId: round.id,
              roundName: round.name,
              segments: [] as {
                segmentNumber: number;
                gameType: GameType;
                score: number;
                holes: number[];
              }[],
            };
            
            for (const segment of rulesJson.segments) {
              const segmentScore = calculateSegmentScore(
                playerId,
                round.id,
                segment.holes,
                segment.gameType
              );
              
              roundBreakdown.segments.push({
                segmentNumber: segment.segmentNumber,
                gameType: segment.gameType,
                score: segmentScore,
                holes: segment.holes,
              });
              
              // For tournament total, we need to normalize scores
              // Stableford: higher is better, so we use negative to sort correctly
              // Stroke Play: lower is better
              if (segment.gameType === GameType.STABLEFORD) {
                playerScores[playerId].totalScore -= segmentScore; // Negative for sorting
              } else {
                playerScores[playerId].totalScore += segmentScore;
              }
            }
            
            playerScores[playerId].segmentBreakdown.push(roundBreakdown);
          } else {
            // Fallback: simple stroke total
            const roundTotal = playerRoundScores.reduce(
              (sum, score) => sum + score.strokes,
              0
            );
            playerScores[playerId].totalScore += roundTotal;
          }
        }
      }
    }

    // Calculate Day 1 position-based points (6,5,4,3,2,1)
    // For each round, rank players by gross score and assign points
    const positionPoints = [6, 5, 4, 3, 2, 1];
    for (const round of tournament.rounds) {
      const roundPlayerScores = Object.values(playerScores)
        .filter((ps) => ps.roundScores.some((rs) => rs.roundId === round.id))
        .map((ps) => ({
          playerId: ps.player.id,
          grossScore: ps.roundScores.find((rs) => rs.roundId === round.id)!.grossScore,
        }))
        .sort((a, b) => a.grossScore - b.grossScore);

      roundPlayerScores.forEach((rps, idx) => {
        const points = idx < positionPoints.length ? positionPoints[idx] : 0;
        const ps = playerScores[rps.playerId];
        const roundScore = ps.roundScores.find((rs) => rs.roundId === round.id);
        if (roundScore) {
          roundScore.points = points;
        }
        ps.totalPoints += points;
      });
    }

    // Sort individual leaderboard
    const individualLeaderboard = Object.values(playerScores)
      .sort((a, b) => a.totalScore - b.totalScore)
      .map((entry, index) => ({
        position: index + 1,
        ...entry,
      }));

    // Calculate team scores
    const teamScores: {
      [teamId: number]: {
        team: { id: number; name: string; color: string };
        totalScore: number;
        totalPoints: number;
        playerCount: number;
        roundPoints: {
          roundId: number;
          roundName: string;
          points: number;
        }[];
      };
    } = {};

    for (const team of tournament.teams) {
      teamScores[team.id] = {
        team: {
          id: team.id,
          name: team.name,
          color: team.color,
        },
        totalScore: 0,
        totalPoints: 0,
        playerCount: 0,
        roundPoints: [],
      };
    }

    // Aggregate team scores from individual players
    for (const playerScore of Object.values(playerScores)) {
      if (playerScore.teamId && teamScores[playerScore.teamId]) {
        teamScores[playerScore.teamId].totalScore += playerScore.totalScore;
        teamScores[playerScore.teamId].totalPoints += playerScore.totalPoints;
        teamScores[playerScore.teamId].playerCount += 1;

        // Aggregate points per round
        for (const roundScore of playerScore.roundScores) {
          const existingRound = teamScores[playerScore.teamId].roundPoints.find(
            (rp) => rp.roundId === roundScore.roundId
          );
          if (!existingRound) {
            teamScores[playerScore.teamId].roundPoints.push({
              roundId: roundScore.roundId,
              roundName: roundScore.roundName,
              points: roundScore.points,
            });
          } else {
            existingRound.points += roundScore.points;
          }
        }
      }
    }

    // Sort team leaderboard by total points (higher is better)
    const teamLeaderboard = Object.values(teamScores)
      .filter((entry) => entry.playerCount > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, index) => ({
        position: index + 1,
        ...entry,
      }));

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
      },
      individualLeaderboard,
      teamLeaderboard,
      hasSegmentScoring: tournament.rounds.some(r => {
        const rulesJson = r.ruleSet?.rulesJson as TournamentRulesJson | undefined;
        return rulesJson?.segments && rulesJson.segments.length > 1;
      }),
    };
  });
