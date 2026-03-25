import { createFileRoute } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Check, Info } from "lucide-react";
import { GameType, TournamentRulesJson, calculateStablefordPoints, legacyToPlayerMatchup, getParticipatingPlayers, MatchFormat } from "~/server/types/tournament";
import { calculateStrokesReceived } from "~/server/utils/courseData";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";

const searchSchema = z.object({
  preview: z.boolean().optional(),
});

export const Route = createFileRoute("/round/$roundId/")({
  component: ScoringPage,
  validateSearch: zodValidator(searchSchema),
});

function ScoringPage() {
  const { roundId } = Route.useParams();
  const { preview } = Route.useSearch();
  const trpc = useTRPC();
  const { getTournamentAccess, canEditPlayer } = useTournamentAccessStore();
  const [currentHole, setCurrentHole] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [scoreInput, setScoreInput] = useState("");

  // Use subscription for real-time updates
  const subscription = useSubscription(
    trpc.subscribeToRoundScores.subscriptionOptions(
      { roundId: parseInt(roundId) },
      {
        enabled: !preview, // Disable subscription in preview mode
        onData: (data) => {
          // Data is automatically updated
        },
        onError: (error) => {
          console.error("Subscription error:", error);
        },
      }
    )
  );

  // Fallback to query for preview mode or if subscription fails
  const roundQuery = useQuery(
    trpc.getRound.queryOptions(
      { roundId: parseInt(roundId) },
      { 
        enabled: preview || subscription.status === "error",
        refetchInterval: preview ? false : 5000,
      }
    )
  );

  // Use subscription data if available, otherwise fall back to query data
  const round = subscription.data || roundQuery.data;

  // Get tournament access info
  const tournamentAccess = round?.tournament 
    ? getTournamentAccess(round.tournament.id)
    : null;
  const isAdmin = round?.tournament 
    ? tournamentAccess?.isAdmin || false
    : false;
  const requestingPlayerId = tournamentAccess?.playerId || null;

  const enterScoreMutation = useMutation(
    trpc.enterScore.mutationOptions({
      onSuccess: () => {
        toast.success("Score recorded!");
        setScoreInput("");
        void roundQuery.refetch();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to record score");
      },
    })
  );

  // Helper to get hole data (par, stroke index) for a specific hole
  const getHoleData = (holeNumber: number): { par: number; strokeIndex: number } | null => {
    if (!round?.holeData || !Array.isArray(round.holeData)) {
      return null;
    }
    
    const holeInfo = round.holeData.find((h: any) => h.hole === holeNumber);
    return holeInfo ? { par: holeInfo.par, strokeIndex: holeInfo.strokeIndex } : null;
  };

  // Helper to get current segment info from rulesJson
  const getCurrentSegmentInfo = (holeNumber: number) => {
    if (!round?.ruleSet?.rulesJson) {
      return {
        gameType: GameType.STROKE_PLAY,
        matchupFormat: { type: "individual" as const },
        segmentNumber: 1,
      };
    }

    const rulesJson = round.ruleSet.rulesJson as TournamentRulesJson;
    const holeRule = rulesJson.holes?.find(h => h.number === holeNumber);
    
    if (holeRule) {
      return {
        gameType: holeRule.gameType,
        matchupFormat: holeRule.matchupFormat,
        segmentNumber: holeRule.segmentNumber,
      };
    }

    return {
      gameType: GameType.STROKE_PLAY,
      matchupFormat: { type: "individual" as const },
      segmentNumber: 1,
    };
  };

  // Helper to calculate Stableford points with actual course data
  const getStablefordPoints = (strokes: number, holeNumber: number, playerHandicap: number = 0) => {
    const holeData = getHoleData(holeNumber);
    const par = holeData?.par || 4;
    const strokeIndex = holeData?.strokeIndex || 18;
    const handicapStrokes = calculateStrokesReceived(playerHandicap, strokeIndex);
    
    return calculateStablefordPoints(strokes, par, handicapStrokes);
  };

  // Helper to get visual indicator for score relative to par
  const getScoreIndicator = (strokes: number, holeNumber: number) => {
    const holeData = getHoleData(holeNumber);
    const par = holeData?.par || 4;
    const scoreToPar = strokes - par;
    
    if (scoreToPar === -1) {
      // Birdie - red circle
      return (
        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {strokes}
        </div>
      );
    } else if (scoreToPar === 1) {
      // Bogey - black square
      return (
        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-sm bg-black text-[10px] font-bold text-white">
          {strokes}
        </div>
      );
    } else if (scoreToPar <= -2) {
      // Eagle or better - double red circle
      return (
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-[10px] font-bold text-white">
          {strokes}
        </div>
      );
    } else if (scoreToPar >= 2) {
      // Double bogey or worse - double black square
      return (
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-sm border-2 border-black bg-black text-[10px] font-bold text-white">
          {strokes}
        </div>
      );
    }
    
    return null; // Par - no indicator
  };

  // Helper to calculate net score (gross - handicap strokes)
  const getNetScore = (grossStrokes: number, holeNumber: number, playerHandicap: number): number => {
    const holeData = getHoleData(holeNumber);
    if (!holeData) {
      // If no course data, use simple handicap reduction
      return Math.max(0, grossStrokes - Math.floor(playerHandicap / 18));
    }
    
    const strokesReceived = calculateStrokesReceived(playerHandicap, holeData.strokeIndex);
    return Math.max(0, grossStrokes - strokesReceived);
  };

  // Helper to get strokes received for a player on a hole
  const getStrokesReceived = (holeNumber: number, playerHandicap: number): number => {
    const holeData = getHoleData(holeNumber);
    if (!holeData) return 0;
    
    return calculateStrokesReceived(playerHandicap, holeData.strokeIndex);
  };

  if (!round) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700">
            {subscription.status === "connecting" ? "Connecting..." : "Loading round..."}
          </p>
        </div>
      </div>
    );
  }

  const currentSegment = getCurrentSegmentInfo(currentHole);
  const players = round.players.map((rp) => rp.player);

  const handleScoreSubmit = () => {
    if (!selectedPlayer || !scoreInput) {
      toast.error("Please select a player and enter a score");
      return;
    }

    const strokes = parseInt(scoreInput);
    if (isNaN(strokes) || strokes < 1) {
      toast.error("Please enter a valid score");
      return;
    }

    // Check permission before submitting
    if (round?.tournament && !canEditPlayer(round.tournament.id, selectedPlayer)) {
      toast.error("You don't have permission to edit this player's score");
      return;
    }

    enterScoreMutation.mutate({
      roundId: parseInt(roundId),
      playerId: selectedPlayer,
      holeNumber: currentHole,
      strokes,
      requestingPlayerId: requestingPlayerId || undefined,
      isAdmin,
    });
  };

  const getPlayerScore = (playerId: number, holeNumber: number) => {
    const score = round.scores.find(
      (s) => s.playerId === playerId && s.holeNumber === holeNumber
    );
    return score?.strokes;
  };

  const getPlayerTotal = (playerId: number) => {
    return round.scores
      .filter((s) => s.playerId === playerId)
      .reduce((sum, s) => sum + s.strokes, 0);
  };

  // Helper function to determine hole winner(s) based on game type
  const getHoleWinner = (holeNumber: number): { playerIds: number[]; teamId?: number } | null => {
    const holeScores = round.scores.filter((s) => s.holeNumber === holeNumber);
    const segmentInfo = getCurrentSegmentInfo(holeNumber);
    
    if (holeScores.length === 0) {
      return null;
    }

    // Convert matchup format to PlayerMatchup for unified handling
    const playerMatchup = legacyToPlayerMatchup(segmentInfo.matchupFormat);
    if (!playerMatchup) {
      return null;
    }

    // Get participating players for this segment
    const participatingPlayerIndices = getParticipatingPlayers(playerMatchup);
    
    // Filter scores to only participating players
    const relevantScores = holeScores.filter(score => {
      const roundPlayer = round.players.find(rp => rp.playerId === score.playerId);
      if (!roundPlayer) return false;
      return participatingPlayerIndices.includes(roundPlayer.position);
    });

    if (relevantScores.length === 0) {
      return null;
    }

    // For Stableford, calculate points instead of using raw strokes
    if (segmentInfo.gameType === GameType.STABLEFORD) {
      const playerPoints: { playerId: number; points: number; teamId?: number; position: number }[] = [];
      
      for (const score of relevantScores) {
        const roundPlayer = round.players.find(rp => rp.playerId === score.playerId);
        const player = roundPlayer?.player;
        const points = player ? getStablefordPoints(score.strokes, holeNumber, player.handicap) : 0;
        
        if (roundPlayer) {
          playerPoints.push({
            playerId: score.playerId,
            points,
            teamId: roundPlayer?.teamId || undefined,
            position: roundPlayer.position,
          });
        }
      }

      // Handle different match formats
      if (playerMatchup.format === MatchFormat.INDIVIDUAL) {
        // Individual game - find player(s) with highest points
        let highestPoints = -1;
        let winningPlayerIds: number[] = [];
        
        for (const pp of playerPoints) {
          if (pp.points > highestPoints) {
            highestPoints = pp.points;
            winningPlayerIds = [pp.playerId];
          } else if (pp.points === highestPoints) {
            winningPlayerIds.push(pp.playerId);
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.FOURSOMES || playerMatchup.format === MatchFormat.FOURBALL) {
        // Team formats - calculate team points (best ball for Fourball, team score for Foursomes)
        const teamPoints: { [key: string]: { points: number; playerIds: number[] } } = {};
        
        for (const match of playerMatchup.matches) {
          // Team 1
          const team1Key = `match${playerMatchup.matches.indexOf(match)}_team1`;
          const team1Players = match.team1PlayerIndices
            .map(idx => playerPoints.find(pp => pp.position === idx))
            .filter(pp => pp !== undefined);
          
          if (team1Players.length > 0) {
            teamPoints[team1Key] = {
              points: playerMatchup.format === MatchFormat.FOURBALL 
                ? Math.max(...team1Players.map(pp => pp.points))
                : team1Players.reduce((sum, pp) => sum + pp.points, 0) / team1Players.length,
              playerIds: team1Players.map(pp => pp.playerId),
            };
          }
          
          // Team 2
          const team2Key = `match${playerMatchup.matches.indexOf(match)}_team2`;
          const team2Players = match.team2PlayerIndices
            .map(idx => playerPoints.find(pp => pp.position === idx))
            .filter(pp => pp !== undefined);
          
          if (team2Players.length > 0) {
            teamPoints[team2Key] = {
              points: playerMatchup.format === MatchFormat.FOURBALL 
                ? Math.max(...team2Players.map(pp => pp.points))
                : team2Players.reduce((sum, pp) => sum + pp.points, 0) / team2Players.length,
              playerIds: team2Players.map(pp => pp.playerId),
            };
          }
        }
        
        // Find winning team
        let highestPoints = -1;
        let winningPlayerIds: number[] = [];
        
        for (const [_, data] of Object.entries(teamPoints)) {
          if (data.points > highestPoints) {
            highestPoints = data.points;
            winningPlayerIds = data.playerIds;
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.SINGLES) {
        // Singles - each match is independent, highlight winners of each match
        const winningPlayerIds: number[] = [];
        
        for (const match of playerMatchup.matches) {
          const player1 = playerPoints.find(pp => pp.position === match.player1Index);
          const player2 = playerPoints.find(pp => pp.position === match.player2Index);
          
          if (player1 && player2) {
            if (player1.points > player2.points) {
              winningPlayerIds.push(player1.playerId);
            } else if (player2.points > player1.points) {
              winningPlayerIds.push(player2.playerId);
            } else {
              // Tie - highlight both
              winningPlayerIds.push(player1.playerId, player2.playerId);
            }
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.FLEXIBLE) {
        // Flexible format - calculate score/points for each side
        const sideResults: { sideIndex: number; matchIndex: number; score: number; playerIds: number[] }[] = [];
        
        for (const [matchIdx, match] of playerMatchup.matches.entries()) {
          for (const [sideIdx, sidePlayerIndices] of match.sides.entries()) {
            const sidePlayers = sidePlayerIndices
              .map(idx => {
                if (segmentInfo.gameType === GameType.STABLEFORD) {
                  return playerPoints.find(pp => pp.position === idx);
                } else {
                  return playerScores.find(ps => ps.position === idx);
                }
              })
              .filter(p => p !== undefined);
            
            if (sidePlayers.length > 0) {
              let sideScore: number;
              
              if (segmentInfo.gameType === GameType.STABLEFORD) {
                // For Stableford, use best ball (highest points)
                sideScore = Math.max(...sidePlayers.map(p => (p as any).points));
              } else {
                // For Stroke Play, use best ball (lowest score)
                sideScore = Math.min(...sidePlayers.map(p => (p as any).score));
              }
              
              sideResults.push({
                sideIndex: sideIdx,
                matchIndex: matchIdx,
                score: sideScore,
                playerIds: sidePlayers.map(p => p.playerId),
              });
            }
          }
        }
        
        // Find winning side(s)
        if (sideResults.length > 0) {
          let bestScore: number;
          if (segmentInfo.gameType === GameType.STABLEFORD) {
            bestScore = Math.max(...sideResults.map(r => r.score));
            const winners = sideResults.filter(r => r.score === bestScore);
            if (winners.length > 0) {
              return { playerIds: winners.flatMap(w => w.playerIds) };
            }
          } else {
            bestScore = Math.min(...sideResults.map(r => r.score));
            const winners = sideResults.filter(r => r.score === bestScore);
            if (winners.length > 0) {
              return { playerIds: winners.flatMap(w => w.playerIds) };
            }
          }
        }
      } else if (playerMatchup.format === MatchFormat.TWO_VS_TWO) {
        // Legacy 2v2 format
        const teamPoints: { [teamId: number]: { points: number; playerIds: number[] } } = {};
        
        for (const pp of playerPoints) {
          if (pp.teamId) {
            if (!teamPoints[pp.teamId]) {
              teamPoints[pp.teamId] = { points: 0, playerIds: [] };
            }
            teamPoints[pp.teamId].points += pp.points;
            teamPoints[pp.teamId].playerIds.push(pp.playerId);
          }
        }
        
        let winningTeamId: number | null = null;
        let highestPoints = -1;
        
        for (const [teamId, data] of Object.entries(teamPoints)) {
          if (data.points > highestPoints) {
            highestPoints = data.points;
            winningTeamId = parseInt(teamId);
          }
        }
        
        if (winningTeamId !== null) {
          return {
            playerIds: teamPoints[winningTeamId].playerIds,
            teamId: winningTeamId,
          };
        }
      }
    } else {
      // Stroke Play or Scramble - lowest score wins
      const playerScores: { playerId: number; score: number; teamId?: number; position: number }[] = [];
      
      for (const score of relevantScores) {
        const roundPlayer = round.players.find(rp => rp.playerId === score.playerId);
        if (roundPlayer) {
          playerScores.push({
            playerId: score.playerId,
            score: score.strokes,
            teamId: roundPlayer?.teamId || undefined,
            position: roundPlayer.position,
          });
        }
      }

      // Handle different match formats
      if (playerMatchup.format === MatchFormat.INDIVIDUAL) {
        // Individual game - find player(s) with lowest score
        let lowestScore = Infinity;
        let winningPlayerIds: number[] = [];
        
        for (const ps of playerScores) {
          if (ps.score < lowestScore) {
            lowestScore = ps.score;
            winningPlayerIds = [ps.playerId];
          } else if (ps.score === lowestScore) {
            winningPlayerIds.push(ps.playerId);
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.FOURSOMES || playerMatchup.format === MatchFormat.FOURBALL) {
        // Team formats - calculate team scores
        const teamScores: { [key: string]: { score: number; playerIds: number[] } } = {};
        
        for (const match of playerMatchup.matches) {
          // Team 1
          const team1Key = `match${playerMatchup.matches.indexOf(match)}_team1`;
          const team1Players = match.team1PlayerIndices
            .map(idx => playerScores.find(ps => ps.position === idx))
            .filter(ps => ps !== undefined);
          
          if (team1Players.length > 0) {
            teamScores[team1Key] = {
              score: playerMatchup.format === MatchFormat.FOURBALL 
                ? Math.min(...team1Players.map(ps => ps.score))
                : team1Players.reduce((sum, ps) => sum + ps.score, 0) / team1Players.length,
              playerIds: team1Players.map(ps => ps.playerId),
            };
          }
          
          // Team 2
          const team2Key = `match${playerMatchup.matches.indexOf(match)}_team2`;
          const team2Players = match.team2PlayerIndices
            .map(idx => playerScores.find(ps => ps.position === idx))
            .filter(ps => ps !== undefined);
          
          if (team2Players.length > 0) {
            teamScores[team2Key] = {
              score: playerMatchup.format === MatchFormat.FOURBALL 
                ? Math.min(...team2Players.map(ps => ps.score))
                : team2Players.reduce((sum, ps) => sum + ps.score, 0) / team2Players.length,
              playerIds: team2Players.map(ps => ps.playerId),
            };
          }
        }
        
        // Find winning team
        let lowestScore = Infinity;
        let winningPlayerIds: number[] = [];
        
        for (const [_, data] of Object.entries(teamScores)) {
          if (data.score < lowestScore) {
            lowestScore = data.score;
            winningPlayerIds = data.playerIds;
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.SINGLES) {
        // Singles - each match is independent
        const winningPlayerIds: number[] = [];
        
        for (const match of playerMatchup.matches) {
          const player1 = playerScores.find(ps => ps.position === match.player1Index);
          const player2 = playerScores.find(ps => ps.position === match.player2Index);
          
          if (player1 && player2) {
            if (player1.score < player2.score) {
              winningPlayerIds.push(player1.playerId);
            } else if (player2.score < player1.score) {
              winningPlayerIds.push(player2.playerId);
            } else {
              // Tie - highlight both
              winningPlayerIds.push(player1.playerId, player2.playerId);
            }
          }
        }
        
        if (winningPlayerIds.length > 0) {
          return { playerIds: winningPlayerIds };
        }
      } else if (playerMatchup.format === MatchFormat.FLEXIBLE) {
        // Flexible format - calculate score/points for each side
        const sideResults: { sideIndex: number; matchIndex: number; score: number; playerIds: number[] }[] = [];
        
        for (const [matchIdx, match] of playerMatchup.matches.entries()) {
          for (const [sideIdx, sidePlayerIndices] of match.sides.entries()) {
            const sidePlayers = sidePlayerIndices
              .map(idx => {
                if (segmentInfo.gameType === GameType.STABLEFORD) {
                  return playerPoints.find(pp => pp.position === idx);
                } else {
                  return playerScores.find(ps => ps.position === idx);
                }
              })
              .filter(p => p !== undefined);
            
            if (sidePlayers.length > 0) {
              let sideScore: number;
              
              if (segmentInfo.gameType === GameType.STABLEFORD) {
                // For Stableford, use best ball (highest points)
                sideScore = Math.max(...sidePlayers.map(p => (p as any).points));
              } else {
                // For Stroke Play, use best ball (lowest score)
                sideScore = Math.min(...sidePlayers.map(p => (p as any).score));
              }
              
              sideResults.push({
                sideIndex: sideIdx,
                matchIndex: matchIdx,
                score: sideScore,
                playerIds: sidePlayers.map(p => p.playerId),
              });
            }
          }
        }
        
        // Find winning side(s)
        if (sideResults.length > 0) {
          let bestScore: number;
          if (segmentInfo.gameType === GameType.STABLEFORD) {
            bestScore = Math.max(...sideResults.map(r => r.score));
            const winners = sideResults.filter(r => r.score === bestScore);
            if (winners.length > 0) {
              return { playerIds: winners.flatMap(w => w.playerIds) };
            }
          } else {
            bestScore = Math.min(...sideResults.map(r => r.score));
            const winners = sideResults.filter(r => r.score === bestScore);
            if (winners.length > 0) {
              return { playerIds: winners.flatMap(w => w.playerIds) };
            }
          }
        }
      } else if (playerMatchup.format === MatchFormat.TWO_VS_TWO) {
        // Legacy 2v2 format - team scores
        const teamScores: { [teamId: number]: { score: number; playerIds: number[] } } = {};
        
        for (const ps of playerScores) {
          if (ps.teamId) {
            if (!teamScores[ps.teamId]) {
              teamScores[ps.teamId] = { score: Infinity, playerIds: [] };
            }
            // For team games, use best ball (lowest score)
            if (ps.score < teamScores[ps.teamId].score) {
              teamScores[ps.teamId].score = ps.score;
            }
            teamScores[ps.teamId].playerIds.push(ps.playerId);
          }
        }
        
        let winningTeamId: number | null = null;
        let lowestScore = Infinity;
        
        for (const [teamId, data] of Object.entries(teamScores)) {
          if (data.score < lowestScore) {
            lowestScore = data.score;
            winningTeamId = parseInt(teamId);
          }
        }
        
        if (winningTeamId !== null) {
          return {
            playerIds: teamScores[winningTeamId].playerIds,
            teamId: winningTeamId,
          };
        }
      }
    }
    
    return null;
  };

  // Helper to group players by team
  const getPlayersByTeam = () => {
    const teamGroups: { [teamId: string]: typeof players } = {};
    const noTeamPlayers: typeof players = [];
    
    round.players.forEach((rp) => {
      if (rp.teamId) {
        if (!teamGroups[rp.teamId]) {
          teamGroups[rp.teamId] = [];
        }
        teamGroups[rp.teamId].push(rp.player);
      } else {
        noTeamPlayers.push(rp.player);
      }
    });
    
    return { teamGroups, noTeamPlayers };
  };

  // Helper to calculate team total score
  const getTeamTotal = (teamId: number, maxHole: number = 18) => {
    const teamPlayerIds = round.players
      .filter(rp => rp.teamId === teamId)
      .map(rp => rp.playerId);
    
    return round.scores
      .filter(s => teamPlayerIds.includes(s.playerId) && s.holeNumber <= maxHole)
      .reduce((sum, s) => sum + s.strokes, 0);
  };

  const quickScores = [3, 4, 5, 6, 7, 8];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {preview && (
        <div className="mb-6 rounded-2xl bg-blue-600 p-4 text-white shadow-xl">
          <div className="flex items-center justify-center space-x-2">
            <Info className="h-5 w-5" />
            <p className="font-semibold">Preview Mode - Scores will not be saved</p>
          </div>
        </div>
      )}

      {/* Hole Navigation */}
      <div className="mb-8 flex items-center justify-between rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
          disabled={currentHole === 1}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">Current Hole</p>
          <p className="text-5xl font-bold text-green-600">{currentHole}</p>
        </div>

        <button
          onClick={() => setCurrentHole(Math.min(18, currentHole + 1))}
          disabled={currentHole === 18}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Segment Info */}
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Current Segment</p>
            <p className="text-lg font-bold text-gray-900">
              Segment {currentSegment.segmentNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-600">Game Type</p>
            <p className="text-lg font-bold text-purple-600">
              {currentSegment.gameType === GameType.SCRAMBLE && "Scramble"}
              {currentSegment.gameType === GameType.STROKE_PLAY && "Stroke Play"}
              {currentSegment.gameType === GameType.STABLEFORD && "Stableford"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-600">Format</p>
            <p className="text-lg font-bold text-purple-600">
              {currentSegment.matchupFormat.type === "2v2" && "2v2"}
              {currentSegment.matchupFormat.type === "1v1+1v1" && "1v1 + 1v1"}
              {currentSegment.matchupFormat.type === "individual" && "Individual"}
            </p>
          </div>
        </div>
        
        {currentSegment.gameType === GameType.STABLEFORD && (
          <div className="mt-4 rounded-lg bg-purple-50 p-3">
            <p className="text-sm font-medium text-purple-900">Stableford Scoring</p>
            <p className="mt-1 text-xs text-purple-800">
              Eagle or better: 4 pts • Birdie: 3 pts • Par: 2 pts • Bogey: 1 pt • Double bogey+: 0 pts
            </p>
          </div>
        )}
      </div>

      {/* Hole Selector */}
      <div className="mb-8 grid grid-cols-9 gap-2">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
          <button
            key={hole}
            onClick={() => setCurrentHole(hole)}
            className={`rounded-lg py-3 text-sm font-semibold transition-all ${
              hole === currentHole
                ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {hole}
          </button>
        ))}
      </div>

      {/* Score Entry Card */}
      <div className="mb-8 rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Enter Score - Hole {currentHole}</h2>

        {/* Player Selection */}
        <div className="mb-6">
          <label className="mb-3 block text-sm font-medium text-gray-700">Select Player</label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {players.map((player) => {
              const hasScore = getPlayerScore(player.id, currentHole) !== undefined;
              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(player.id)}
                  disabled={round?.tournament && !canEditPlayer(round.tournament.id, player.id)}
                  className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                    selectedPlayer === player.id
                      ? "border-green-600 bg-green-50"
                      : round?.tournament && !canEditPlayer(round.tournament.id, player.id)
                      ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{player.name}</p>
                      <p className="text-sm text-gray-600">HCP: {player.handicap}</p>
                    </div>
                    {hasScore && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white">
                        <Check className="h-5 w-5" />
                      </div>
                    )}
                    {round?.tournament && !canEditPlayer(round.tournament.id, player.id) && (
                      <div className="absolute top-2 right-2 rounded bg-gray-200 px-2 py-1 text-xs text-gray-600">
                        View Only
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Score Input */}
        {selectedPlayer && (
          <div className="space-y-4">
            <div>
              <label className="mb-3 block text-sm font-medium text-gray-700">Score</label>
              <input
                type="number"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-2xl font-bold focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="Enter strokes"
                min="1"
              />
            </div>

            {/* Quick Score Buttons */}
            <div className="grid grid-cols-6 gap-2">
              {quickScores.map((score) => (
                <button
                  key={score}
                  onClick={() => setScoreInput(String(score))}
                  className="rounded-lg border-2 border-gray-300 py-3 text-lg font-semibold text-gray-700 hover:border-green-600 hover:bg-green-50 hover:text-green-600"
                >
                  {score}
                </button>
              ))}
            </div>

            <button
              onClick={handleScoreSubmit}
              disabled={enterScoreMutation.isPending || !scoreInput}
              className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 py-4 text-lg font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
            >
              {enterScoreMutation.isPending ? "Recording..." : "Record Score"}
            </button>
          </div>
        )}
      </div>

      {/* Course Data Info */}
      {round.holeData && Array.isArray(round.holeData) && (
        <div className="mb-6 rounded-2xl bg-blue-50 p-4">
          <div className="flex items-center space-x-2 text-blue-900">
            <Info className="h-5 w-5" />
            <p className="text-sm font-semibold">
              Course data loaded - Net scores calculated using stroke index
            </p>
          </div>
          <p className="mt-1 text-xs text-blue-800">
            Handicap strokes are automatically allocated based on hole difficulty
          </p>
        </div>
      )}

      {/* Scorecard */}
      <div className="rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Scorecard</h2>

        {/* Front 9 */}
        <div className="mb-4 rounded-lg bg-green-100 px-4 py-2">
          <h3 className="text-lg font-bold text-green-900">Front 9 (Holes 1-9)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-3 pr-4 text-left text-sm font-semibold text-gray-700">Player</th>
                {Array.from({ length: 9 }, (_, i) => i + 1).map((hole) => {
                  const holeData = getHoleData(hole);
                  return (
                    <th
                      key={hole}
                      className={`pb-3 px-2 text-center ${
                        hole === currentHole ? "bg-green-50" : ""
                      }`}
                    >
                      <div className="text-sm font-semibold text-gray-700">{hole}</div>
                      {holeData && (
                        <div className="text-xs text-gray-500">
                          Par {holeData.par} • SI {holeData.strokeIndex}
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="pb-3 px-2 text-center text-sm font-semibold text-gray-700">OUT</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const { teamGroups, noTeamPlayers } = getPlayersByTeam();
                const rows: JSX.Element[] = [];
                
                // Render team groups
                Object.entries(teamGroups).forEach(([teamId, teamPlayers]) => {
                  const team = round.players.find(rp => rp.teamId === parseInt(teamId))?.team;
                  
                  // Add team header row
                  if (team) {
                    rows.push(
                      <tr key={`team-header-${teamId}`} className="border-t-2 border-gray-300">
                        <td colSpan={11} className="py-2 px-4 bg-gray-50">
                          <div className="flex items-center space-x-2">
                            <div
                              className="h-4 w-4 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            <span className="font-bold text-gray-900">{team.name}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Add player rows for this team
                  teamPlayers.forEach((player) => {
                    rows.push(
                      <tr key={player.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {player.name}
                              {team && (
                                <span className="ml-2 text-sm font-normal text-gray-600">
                                  ({team.name})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600">HCP {player.handicap}</p>
                          </div>
                        </td>
                        {Array.from({ length: 9 }, (_, i) => i + 1).map((hole) => {
                          const score = getPlayerScore(player.id, hole);
                          const holeWinner = getHoleWinner(hole);
                          const isWinner = holeWinner?.playerIds.includes(player.id);
                          const strokesReceived = getStrokesReceived(hole, player.handicap);
                          const netScore = score !== undefined ? getNetScore(score, hole, player.handicap) : undefined;
                          
                          return (
                            <td
                              key={hole}
                              className={`relative py-3 px-2 text-center font-semibold ${
                                hole === currentHole ? "bg-green-50" : ""
                              } ${isWinner && score !== undefined ? "bg-green-500 text-white" : ""}`}
                            >
                              {score !== undefined ? (
                                <div className="relative inline-block">
                                  <div className="flex flex-col items-center">
                                    <span className={isWinner ? "font-bold" : "text-gray-900"}>
                                      {score}
                                    </span>
                                    {strokesReceived > 0 && (
                                      <div className="mt-0.5 flex items-center space-x-1">
                                        <span className="text-xs text-purple-600 font-semibold">
                                          -{strokesReceived}
                                        </span>
                                        <span className="text-xs text-gray-500">=</span>
                                        <span className="text-xs text-purple-600 font-semibold">
                                          {netScore}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!isWinner && getScoreIndicator(score, hole)}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-2 text-center font-bold text-gray-900">
                          {round.scores.filter((s) => s.playerId === player.id && s.holeNumber <= 9).length > 0
                            ? round.scores
                                .filter((s) => s.playerId === player.id && s.holeNumber <= 9)
                                .reduce((sum, s) => sum + s.strokes, 0)
                            : "-"}
                        </td>
                      </tr>
                    );
                  });
                  
                  // Add team total row
                  if (team) {
                    const teamOut = getTeamTotal(parseInt(teamId), 9);
                    rows.push(
                      <tr key={`team-total-${teamId}`} className="border-b-2 border-gray-300 bg-gray-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center space-x-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            <span className="font-bold text-gray-900">{team.name} Total</span>
                          </div>
                        </td>
                        <td colSpan={9} className="py-3 px-2"></td>
                        <td className="py-3 px-2 text-center text-lg font-bold text-purple-600">
                          {teamOut > 0 ? teamOut : "-"}
                        </td>
                      </tr>
                    );
                  }
                });
                
                // Render players without teams
                if (noTeamPlayers.length > 0) {
                  noTeamPlayers.forEach((player) => {
                    rows.push(
                      <tr key={player.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-semibold text-gray-900">{player.name}</p>
                            <p className="text-xs text-gray-600">HCP {player.handicap}</p>
                          </div>
                        </td>
                        {Array.from({ length: 9 }, (_, i) => i + 1).map((hole) => {
                          const score = getPlayerScore(player.id, hole);
                          const holeWinner = getHoleWinner(hole);
                          const isWinner = holeWinner?.playerIds.includes(player.id);
                          const strokesReceived = getStrokesReceived(hole, player.handicap);
                          const netScore = score !== undefined ? getNetScore(score, hole, player.handicap) : undefined;
                          
                          return (
                            <td
                              key={hole}
                              className={`relative py-3 px-2 text-center font-semibold ${
                                hole === currentHole ? "bg-green-50" : ""
                              } ${isWinner && score !== undefined ? "bg-green-500 text-white" : ""}`}
                            >
                              {score !== undefined ? (
                                <div className="relative inline-block">
                                  <div className="flex flex-col items-center">
                                    <span className={isWinner ? "font-bold" : "text-gray-900"}>
                                      {score}
                                    </span>
                                    {strokesReceived > 0 && (
                                      <div className="mt-0.5 flex items-center space-x-1">
                                        <span className="text-xs text-purple-600 font-semibold">
                                          -{strokesReceived}
                                        </span>
                                        <span className="text-xs text-gray-500">=</span>
                                        <span className="text-xs text-purple-600 font-semibold">
                                          {netScore}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!isWinner && getScoreIndicator(score, hole)}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-2 text-center font-bold text-gray-900">
                          {round.scores.filter((s) => s.playerId === player.id && s.holeNumber <= 9).length > 0
                            ? round.scores
                                .filter((s) => s.playerId === player.id && s.holeNumber <= 9)
                                .reduce((sum, s) => sum + s.strokes, 0)
                            : "-"}
                        </td>
                      </tr>
                    );
                  });
                }
                
                return rows;
              })()}
            </tbody>
          </table>
        </div>

        {/* Back 9 */}
        <div className="mb-4 mt-8 rounded-lg bg-blue-100 px-4 py-2">
          <h3 className="text-lg font-bold text-blue-900">Back 9 (Holes 10-18)</h3>
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-3 pr-4 text-left text-sm font-semibold text-gray-700">Player</th>
                {Array.from({ length: 9 }, (_, i) => i + 10).map((hole) => {
                  const holeData = getHoleData(hole);
                  return (
                    <th
                      key={hole}
                      className={`pb-3 px-2 text-center ${
                        hole === currentHole ? "bg-green-50" : ""
                      }`}
                    >
                      <div className="text-sm font-semibold text-gray-700">{hole}</div>
                      {holeData && (
                        <div className="text-xs text-gray-500">
                          Par {holeData.par} • SI {holeData.strokeIndex}
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="pb-3 px-2 text-center text-sm font-semibold text-gray-700">IN</th>
                <th className="pb-3 px-2 text-center text-sm font-semibold text-green-600">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const { teamGroups, noTeamPlayers } = getPlayersByTeam();
                const rows: JSX.Element[] = [];
                
                // Render team groups
                Object.entries(teamGroups).forEach(([teamId, teamPlayers]) => {
                  const team = round.players.find(rp => rp.teamId === parseInt(teamId))?.team;
                  
                  // Add team header row
                  if (team) {
                    rows.push(
                      <tr key={`team-header-back-${teamId}`} className="border-t-2 border-gray-300">
                        <td colSpan={12} className="py-2 px-4 bg-gray-50">
                          <div className="flex items-center space-x-2">
                            <div
                              className="h-4 w-4 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            <span className="font-bold text-gray-900">{team.name}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Add player rows for this team
                  teamPlayers.forEach((player) => {
                    rows.push(
                      <tr key={player.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {player.name}
                              {team && (
                                <span className="ml-2 text-sm font-normal text-gray-600">
                                  ({team.name})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600">HCP {player.handicap}</p>
                          </div>
                        </td>
                        {Array.from({ length: 9 }, (_, i) => i + 10).map((hole) => {
                          const score = getPlayerScore(player.id, hole);
                          const holeWinner = getHoleWinner(hole);
                          const isWinner = holeWinner?.playerIds.includes(player.id);
                          const strokesReceived = getStrokesReceived(hole, player.handicap);
                          const netScore = score !== undefined ? getNetScore(score, hole, player.handicap) : undefined;
                          
                          return (
                            <td
                              key={hole}
                              className={`relative py-3 px-2 text-center font-semibold ${
                                hole === currentHole ? "bg-green-50" : ""
                              } ${isWinner && score !== undefined ? "bg-green-500 text-white" : ""}`}
                            >
                              {score !== undefined ? (
                                <div className="relative inline-block">
                                  <div className="flex flex-col items-center">
                                    <span className={isWinner ? "font-bold" : "text-gray-900"}>
                                      {score}
                                    </span>
                                    {strokesReceived > 0 && (
                                      <div className="mt-0.5 flex items-center space-x-1">
                                        <span className="text-xs text-purple-600 font-semibold">
                                          -{strokesReceived}
                                        </span>
                                        <span className="text-xs text-gray-500">=</span>
                                        <span className="text-xs text-purple-600 font-semibold">
                                          {netScore}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!isWinner && getScoreIndicator(score, hole)}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-2 text-center font-bold text-gray-900">
                          {round.scores.filter((s) => s.playerId === player.id && s.holeNumber > 9).length > 0
                            ? round.scores
                                .filter((s) => s.playerId === player.id && s.holeNumber > 9)
                                .reduce((sum, s) => sum + s.strokes, 0)
                            : "-"}
                        </td>
                        <td className="py-3 px-2 text-center text-lg font-bold text-green-600">
                          {round.scores.filter((s) => s.playerId === player.id).length > 0
                            ? getPlayerTotal(player.id)
                            : "-"}
                        </td>
                      </tr>
                    );
                  });
                  
                  // Add team total row
                  if (team) {
                    const teamIn = getTeamTotal(parseInt(teamId), 18) - getTeamTotal(parseInt(teamId), 9);
                    const teamTotal = getTeamTotal(parseInt(teamId), 18);
                    rows.push(
                      <tr key={`team-total-back-${teamId}`} className="border-b-2 border-gray-300 bg-gray-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center space-x-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            <span className="font-bold text-gray-900">{team.name} Total</span>
                          </div>
                        </td>
                        <td colSpan={9} className="py-3 px-2"></td>
                        <td className="py-3 px-2 text-center text-lg font-bold text-purple-600">
                          {teamIn > 0 ? teamIn : "-"}
                        </td>
                        <td className="py-3 px-2 text-center text-xl font-bold text-purple-600">
                          {teamTotal > 0 ? teamTotal : "-"}
                        </td>
                      </tr>
                    );
                  }
                });
                
                // Render players without teams
                if (noTeamPlayers.length > 0) {
                  noTeamPlayers.forEach((player) => {
                    rows.push(
                      <tr key={player.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-semibold text-gray-900">{player.name}</p>
                            <p className="text-xs text-gray-600">HCP {player.handicap}</p>
                          </div>
                        </td>
                        {Array.from({ length: 9 }, (_, i) => i + 10).map((hole) => {
                          const score = getPlayerScore(player.id, hole);
                          const holeWinner = getHoleWinner(hole);
                          const isWinner = holeWinner?.playerIds.includes(player.id);
                          const strokesReceived = getStrokesReceived(hole, player.handicap);
                          const netScore = score !== undefined ? getNetScore(score, hole, player.handicap) : undefined;
                          
                          return (
                            <td
                              key={hole}
                              className={`relative py-3 px-2 text-center font-semibold ${
                                hole === currentHole ? "bg-green-50" : ""
                              } ${isWinner && score !== undefined ? "bg-green-500 text-white" : ""}`}
                            >
                              {score !== undefined ? (
                                <div className="relative inline-block">
                                  <div className="flex flex-col items-center">
                                    <span className={isWinner ? "font-bold" : "text-gray-900"}>
                                      {score}
                                    </span>
                                    {strokesReceived > 0 && (
                                      <div className="mt-0.5 flex items-center space-x-1">
                                        <span className="text-xs text-purple-600 font-semibold">
                                          -{strokesReceived}
                                        </span>
                                        <span className="text-xs text-gray-500">=</span>
                                        <span className="text-xs text-purple-600 font-semibold">
                                          {netScore}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!isWinner && getScoreIndicator(score, hole)}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-2 text-center font-bold text-gray-900">
                          {round.scores.filter((s) => s.playerId === player.id && s.holeNumber > 9).length > 0
                            ? round.scores
                                .filter((s) => s.playerId === player.id && s.holeNumber > 9)
                                .reduce((sum, s) => sum + s.strokes, 0)
                            : "-"}
                        </td>
                        <td className="py-3 px-2 text-center text-lg font-bold text-green-600">
                          {round.scores.filter((s) => s.playerId === player.id).length > 0
                            ? getPlayerTotal(player.id)
                            : "-"}
                        </td>
                      </tr>
                    );
                  });
                }
                
                return rows;
              })()}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">Score Indicators:</p>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 sm:grid-cols-4">
            <div className="flex items-center space-x-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-[10px] font-bold text-white">
                2
              </div>
              <span>Eagle or better</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                3
              </div>
              <span>Birdie (-1)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-black text-[10px] font-bold text-white">
                5
              </div>
              <span>Bogey (+1)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm border-2 border-black bg-black text-[10px] font-bold text-white">
                6
              </div>
              <span>Double bogey or worse</span>
            </div>
          </div>
          <div className="mt-4 flex items-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded bg-green-500"></div>
              <span>Hole Winner</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded bg-green-50 border border-green-200"></div>
              <span>Current Hole</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-purple-600">-1 = 3</span>
              <span>Strokes received (Net score)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
