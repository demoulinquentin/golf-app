import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

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
          orderBy: { id: "asc" },
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

    // Build round info for column headers
    const rounds = tournament.rounds.map((r) => ({
      roundId: r.id,
      roundName: r.name,
    }));

    // Build player map from all rounds
    const playerScores: {
      [playerId: number]: {
        player: { id: number; name: string; handicap: number };
        teamId?: number;
        teamName?: string;
        teamColor?: string;
        totalGrossScore: number;
        totalNetScore: number;
        totalPoints: number;
        roundScores: {
          roundId: number;
          roundName: string;
          grossScore: number | null;
          netScore: number | null;
          points: number;
        }[];
      };
    } = {};

    for (const round of tournament.rounds) {
      for (const roundPlayer of round.players) {
        const playerId = roundPlayer.player.id;

        if (!playerScores[playerId]) {
          // Find team color from tournament teams
          const tournamentTeam = tournament.teams.find(
            (t) => t.id === roundPlayer.team?.id
          );
          playerScores[playerId] = {
            player: {
              id: roundPlayer.player.id,
              name: roundPlayer.player.name,
              handicap: roundPlayer.player.handicap,
            },
            teamId: roundPlayer.team?.id,
            teamName: roundPlayer.team?.name,
            teamColor: tournamentTeam?.color,
            totalGrossScore: 0,
            totalNetScore: 0,
            totalPoints: 0,
            roundScores: [],
          };
        }

        const playerRoundScores = round.scores.filter(
          (s) => s.playerId === playerId
        );

        // Parse hole data for net score calculation
        const holeData = round.holeData as
          | { hole: number; par: number; strokeIndex: number }[]
          | null;

        if (playerRoundScores.length > 0) {
          const totalStrokes = playerRoundScores.reduce(
            (sum, s) => sum + s.strokes,
            0
          );

          // Calculate par for holes played and strokes received
          let totalPar = 0;
          let totalStrokesReceived = 0;
          const handicap = roundPlayer.player.handicap;

          for (const s of playerRoundScores) {
            const hole = holeData?.find((h) => h.hole === s.holeNumber);
            totalPar += hole?.par || 4;
            if (hole) {
              const base = Math.floor(handicap / 18);
              const extra = hole.strokeIndex <= handicap % 18 ? 1 : 0;
              totalStrokesReceived += base + extra;
            }
          }

          const grossScore = totalStrokes - totalPar; // relative to par
          const netScore = grossScore - totalStrokesReceived; // gross minus handicap strokes

          playerScores[playerId].totalGrossScore += grossScore;
          playerScores[playerId].totalNetScore += netScore;
          playerScores[playerId].roundScores.push({
            roundId: round.id,
            roundName: round.name,
            grossScore,
            netScore,
            points: 0,
          });
        } else {
          // No scores yet — still add the round entry with nulls
          playerScores[playerId].roundScores.push({
            roundId: round.id,
            roundName: round.name,
            grossScore: null,
            netScore: null,
            points: 0,
          });
        }
      }
    }

    // Calculate position-based points per round (6,5,4,3,2,1 based on net score)
    // Ties: split the sum of positions' points equally
    // e.g., 2 tied for 2nd → each gets (5+4)/2 = 4.5
    const positionPoints = [6, 5, 4, 3, 2, 1];
    for (const round of tournament.rounds) {
      const playersWithScores = Object.values(playerScores)
        .map((ps) => {
          const rs = ps.roundScores.find((r) => r.roundId === round.id);
          return { playerId: ps.player.id, netScore: rs?.netScore };
        })
        .filter((p) => p.netScore !== null && p.netScore !== undefined)
        .sort((a, b) => a.netScore! - b.netScore!);

      // Group by net score to handle ties
      let pos = 0;
      while (pos < playersWithScores.length) {
        // Find all players with the same net score
        const currentNet = playersWithScores[pos].netScore!;
        let tieCount = 0;
        while (
          pos + tieCount < playersWithScores.length &&
          playersWithScores[pos + tieCount].netScore === currentNet
        ) {
          tieCount++;
        }

        // Sum points for all tied positions and divide equally
        let totalPtsForTied = 0;
        for (let i = 0; i < tieCount; i++) {
          const idx = pos + i;
          totalPtsForTied += idx < positionPoints.length ? positionPoints[idx] : 0;
        }
        const sharedPts = totalPtsForTied / tieCount;

        // Assign to each tied player
        for (let i = 0; i < tieCount; i++) {
          const p = playersWithScores[pos + i];
          const ps = playerScores[p.playerId];
          const rs = ps.roundScores.find((r) => r.roundId === round.id);
          if (rs) rs.points = sharedPts;
          ps.totalPoints += sharedPts;
        }

        pos += tieCount;
      }
    }

    // Sort individual leaderboard by total points (highest first)
    const individualLeaderboard = Object.values(playerScores)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, index) => ({
        position: index + 1,
        ...entry,
      }));

    // Calculate team scores
    const teamScores: {
      [teamId: number]: {
        team: { id: number; name: string; color: string };
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
        team: { id: team.id, name: team.name, color: team.color },
        totalPoints: 0,
        playerCount: 0,
        roundPoints: rounds.map((r) => ({
          roundId: r.roundId,
          roundName: r.roundName,
          points: 0,
        })),
      };
    }

    for (const playerScore of Object.values(playerScores)) {
      if (playerScore.teamId && teamScores[playerScore.teamId]) {
        teamScores[playerScore.teamId].totalPoints += playerScore.totalPoints;
        teamScores[playerScore.teamId].playerCount += 1;

        for (const rs of playerScore.roundScores) {
          const teamRound = teamScores[playerScore.teamId].roundPoints.find(
            (rp) => rp.roundId === rs.roundId
          );
          if (teamRound) teamRound.points += rs.points;
        }
      }
    }

    const teamLeaderboard = Object.values(teamScores)
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
      rounds,
      individualLeaderboard,
      teamLeaderboard,
    };
  });
