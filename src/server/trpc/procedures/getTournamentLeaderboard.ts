import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { calculateStrokesReceived } from "~/server/utils/courseData";

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
              totalStrokesReceived += calculateStrokesReceived(handicap, hole.strokeIndex);
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

    // Calculate points per round — different logic for Day 1 vs Day 2
    const positionPoints = [6, 5, 4, 3, 2, 1];

    for (const round of tournament.rounds) {
      const rulesJson = round.ruleSet?.rulesJson as any;
      const day2Config = rulesJson?.day2Config;
      const holeData = round.holeData as
        | { hole: number; par: number; strokeIndex: number }[]
        | null;

      if (day2Config?.matches) {
        // ── Day 2: Matchplay scoring ──────────────────────────────────
        // Each match is decided hole by hole (net score comparison).
        // Player who won more holes wins the match (1 pt). Equal = 0.5 each.
        // Live: show provisional result based on holes played so far.

        // Map position index → actual player ID
        const playersByPosition = round.players
          .slice()
          .sort((a, b) => a.position - b.position);

        for (const match of day2Config.matches as any[]) {
          const rp1 = playersByPosition[match.player1Index];
          const rp2 = playersByPosition[match.player2Index];
          if (!rp1 || !rp2) continue;

          const p1Id = rp1.player.id;
          const p2Id = rp2.player.id;
          const p1Hcp = rp1.player.handicap;
          const p2Hcp = rp2.player.handicap;

          // Determine holes for this segment
          const segNum = match.segmentNumber as number;
          const segStart = (segNum - 1) * 6 + 1;
          const segHoles = Array.from({ length: 6 }, (_, i) => segStart + i);

          let p1HolesWon = 0;
          let p2HolesWon = 0;
          let holesPlayed = 0;

          for (const h of segHoles) {
            const s1 = round.scores.find((s) => s.playerId === p1Id && s.holeNumber === h);
            const s2 = round.scores.find((s) => s.playerId === p2Id && s.holeNumber === h);
            if (!s1 || !s2) continue; // both must have scored

            holesPlayed++;
            const hole = holeData?.find((hd) => hd.hole === h);
            const sr1 = hole ? calculateStrokesReceived(p1Hcp, hole.strokeIndex) : 0;
            const sr2 = hole ? calculateStrokesReceived(p2Hcp, hole.strokeIndex) : 0;
            const net1 = s1.strokes - sr1;
            const net2 = s2.strokes - sr2;

            if (net1 < net2) p1HolesWon++;
            else if (net2 < net1) p2HolesWon++;
          }

          // Assign points (live — based on current state)
          let p1Pts = 0;
          let p2Pts = 0;
          if (holesPlayed > 0) {
            if (p1HolesWon > p2HolesWon) {
              p1Pts = 1;
              p2Pts = 0;
            } else if (p2HolesWon > p1HolesWon) {
              p1Pts = 0;
              p2Pts = 1;
            } else {
              p1Pts = 0.5;
              p2Pts = 0.5;
            }
          }

          // Add to player scores
          const ps1 = playerScores[p1Id];
          const ps2 = playerScores[p2Id];
          if (ps1) {
            const rs = ps1.roundScores.find((r) => r.roundId === round.id);
            if (rs) rs.points += p1Pts;
            ps1.totalPoints += p1Pts;
          }
          if (ps2) {
            const rs = ps2.roundScores.find((r) => r.roundId === round.id);
            if (rs) rs.points += p2Pts;
            ps2.totalPoints += p2Pts;
          }
        }
      } else {
        // ── Day 1 / Day 3: Position-based scoring (6,5,4,3,2,1) ──────
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
          const currentNet = playersWithScores[pos].netScore!;
          let tieCount = 0;
          while (
            pos + tieCount < playersWithScores.length &&
            playersWithScores[pos + tieCount].netScore === currentNet
          ) {
            tieCount++;
          }

          let totalPtsForTied = 0;
          for (let i = 0; i < tieCount; i++) {
            const idx = pos + i;
            totalPtsForTied += idx < positionPoints.length ? positionPoints[idx] : 0;
          }
          const sharedPts = totalPtsForTied / tieCount;

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
