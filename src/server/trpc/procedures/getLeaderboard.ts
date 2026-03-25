import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { calculateStrokesReceived, calculateNetScore } from "~/server/utils/courseData";

export const getLeaderboard = baseProcedure
  .input(z.object({ roundId: z.number() }))
  .query(async ({ input }) => {
    const round = await db.round.findUnique({
      where: { id: input.roundId },
      include: {
        players: {
          include: {
            player: true,
            team: true, // Include team information
          },
          orderBy: { position: "asc" },
        },
        scores: {
          include: {
            player: true,
          },
        },
      },
    });

    if (!round) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Round not found",
      });
    }

    // Calculate total strokes for each player
    const playerScores = round.players.map((rp) => {
      const scores = round.scores.filter((s) => s.playerId === rp.playerId);
      const totalStrokes = scores.reduce((sum, s) => sum + s.strokes, 0);
      const holesPlayed = scores.length;
      const lastHole = scores.length > 0 ? Math.max(...scores.map((s) => s.holeNumber)) : 0;

      // Calculate net score using hole data if available
      let netScore = totalStrokes;
      if (round.holeData && Array.isArray(round.holeData)) {
        // Calculate net score hole by hole using stroke index
        netScore = scores.reduce((sum, score) => {
          const holeData = (round.holeData as any[]).find((h: any) => h.hole === score.holeNumber);
          if (holeData) {
            const strokesReceived = calculateStrokesReceived(rp.player.handicap, holeData.strokeIndex);
            return sum + Math.max(0, score.strokes - strokesReceived);
          }
          // Fallback if no hole data
          return sum + score.strokes;
        }, 0);
      } else if (rp.player.handicap > 0) {
        // Fallback: simple handicap reduction
        netScore = Math.round(totalStrokes - rp.player.handicap);
      }

      return {
        playerId: rp.playerId,
        playerName: rp.player.name,
        handicap: rp.player.handicap,
        teamId: rp.teamId,
        teamName: rp.team?.name,
        teamColor: rp.team?.color,
        totalStrokes,
        netScore,
        holesPlayed,
        lastHole,
        scores: scores.sort((a, b) => a.holeNumber - b.holeNumber),
      };
    });

    // Sort by net score (ascending) for players with handicaps, otherwise gross score
    playerScores.sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      
      // Use net score if handicaps are in play
      if (a.handicap > 0 || b.handicap > 0) {
        return a.netScore - b.netScore;
      }
      
      // Otherwise use gross score
      return a.totalStrokes - b.totalStrokes;
    });

    // Calculate team scores
    const teamScores: {
      [teamId: number]: {
        teamId: number;
        teamName: string;
        teamColor: string;
        totalStrokes: number;
        playerCount: number;
        players: Array<{ playerId: number; playerName: string; totalStrokes: number; netScore: number }>;
      };
    } = {};

    for (const ps of playerScores) {
      if (ps.teamId && ps.teamName) {
        if (!teamScores[ps.teamId]) {
          teamScores[ps.teamId] = {
            teamId: ps.teamId,
            teamName: ps.teamName,
            teamColor: ps.teamColor || "#6366f1",
            totalStrokes: 0,
            playerCount: 0,
            players: [],
          };
        }
        teamScores[ps.teamId].totalStrokes += ps.netScore;
        teamScores[ps.teamId].playerCount += 1;
        teamScores[ps.teamId].players.push({
          playerId: ps.playerId,
          playerName: ps.playerName,
          totalStrokes: ps.totalStrokes,
          netScore: ps.netScore,
        });
      }
    }

    // Sort team leaderboard
    const teamLeaderboard = Object.values(teamScores)
      .sort((a, b) => {
        if (a.playerCount === 0 && b.playerCount === 0) return 0;
        if (a.playerCount === 0) return 1;
        if (b.playerCount === 0) return -1;
        return a.totalStrokes - b.totalStrokes;
      })
      .map((team, index) => ({
        position: index + 1,
        ...team,
      }));

    return {
      round: {
        id: round.id,
        name: round.name,
        courseName: round.courseName,
        currentHole: round.currentHole,
        status: round.status,
      },
      leaderboard: playerScores,
      teamLeaderboard,
    };
  });
