import { createFileRoute } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
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

// ─── Types ───────────────────────────────────────────────────────────────────

type HoleInfo = { hole: number; par: number; strokeIndex: number };

type TabId = "leaderboard" | "party1" | "party2" | "matchplay" | "seg1" | "seg2" | "seg3";

type Day2Match = {
  id: string;
  segmentNumber: number;
  player1Index: number;
  player2Index: number;
  type: "within-party" | "blind";
};

type Day2Config = {
  party1PlayerIndices: number[];
  party2PlayerIndices: number[];
  matches: Day2Match[];
};

// ─── Main Component ──────────────────────────────────────────────────────────

function ScoringPage() {
  const { roundId } = Route.useParams();
  const { preview } = Route.useSearch();
  const trpc = useTRPC();
  const { getTournamentAccess, canEditPlayer } = useTournamentAccessStore();

  const [activeTab, setActiveTab] = useState<TabId>("leaderboard");
  const [scoreModal, setScoreModal] = useState<{
    playerId: number;
    holeNumber: number;
    playerName: string;
  } | null>(null);

  // ── Real-time subscription ───────────────────────────────────────────────

  const subscription = useSubscription(
    trpc.subscribeToRoundScores.subscriptionOptions(
      { roundId: parseInt(roundId) },
      {
        enabled: !preview,
        onError: (error) => {
          console.error("Subscription error:", error);
        },
      }
    )
  );

  const roundQuery = useQuery(
    trpc.getRound.queryOptions(
      { roundId: parseInt(roundId) },
      {
        enabled: preview || subscription.status === "error",
        refetchInterval: preview ? false : 10000,
      }
    )
  );

  const round = subscription.data || roundQuery.data;

  // ── Auto-refresh leaderboard every 10s ───────────────────────────────────

  useEffect(() => {
    if ((activeTab !== "leaderboard" && activeTab !== "matchplay") || preview) return;
    const interval = setInterval(() => {
      void roundQuery.refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab, preview, roundQuery]);

  // ── Access control ─────────────────────────────────────────────────────────

  const tournamentAccess = round?.tournamentId
    ? getTournamentAccess(round.tournamentId)
    : null;
  const isAdmin = tournamentAccess?.isAdmin || false;
  const requestingPlayerId = tournamentAccess?.playerId || null;

  // ── Enter score mutation ───────────────────────────────────────────────────

  const enterScoreMutation = useMutation(
    trpc.enterScore.mutationOptions({
      onSuccess: () => {
        toast.success("Score recorded!");
        setScoreModal(null);
        void roundQuery.refetch();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to record score");
      },
    })
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  const holeDataArray: HoleInfo[] = useMemo(() => {
    if (!round?.holeData || !Array.isArray(round.holeData)) return [];
    return round.holeData as HoleInfo[];
  }, [round?.holeData]);

  const getHoleData = useCallback(
    (holeNumber: number): HoleInfo | undefined => {
      return holeDataArray.find((h) => h.hole === holeNumber);
    },
    [holeDataArray]
  );

  const getPlayerScore = useCallback(
    (playerId: number, holeNumber: number): number | undefined => {
      if (!round) return undefined;
      const score = round.scores.find(
        (s) => s.playerId === playerId && s.holeNumber === holeNumber
      );
      return score?.strokes;
    },
    [round]
  );

  const getStrokesReceivedForHole = useCallback(
    (holeNumber: number, handicap: number): number => {
      const hd = getHoleData(holeNumber);
      if (!hd) return 0;
      return calculateStrokesReceived(handicap, hd.strokeIndex);
    },
    [getHoleData]
  );

  // ── Determine teams / parties ──────────────────────────────────────────────

  const { team1, team2, team1Name, team2Name } = useMemo(() => {
    if (!round) return { team1: [] as any[], team2: [] as any[], team1Name: "Party 1", team2Name: "Party 2" };

    // Group players by team
    const teamMap = new Map<number, { name: string; players: any[] }>();
    const noTeam: any[] = [];

    for (const rp of round.players) {
      if (rp.teamId) {
        if (!teamMap.has(rp.teamId)) {
          const teamName = (rp as any).team?.name || `Team ${rp.teamId}`;
          teamMap.set(rp.teamId, { name: teamName, players: [] });
        }
        teamMap.get(rp.teamId)!.players.push(rp);
      } else {
        noTeam.push(rp);
      }
    }

    const teamEntries = Array.from(teamMap.entries());

    if (teamEntries.length >= 2) {
      const first = teamEntries[0]!;
      const second = teamEntries[1]!;
      return {
        team1: first[1].players,
        team2: second[1].players,
        team1Name: first[1].name,
        team2Name: second[1].name,
      };
    } else if (teamEntries.length === 1) {
      const first = teamEntries[0]!;
      return {
        team1: first[1].players,
        team2: noTeam,
        team1Name: first[1].name,
        team2Name: "Others",
      };
    } else {
      // No teams - split evenly
      const half = Math.ceil(noTeam.length / 2);
      return {
        team1: noTeam.slice(0, half),
        team2: noTeam.slice(half),
        team1Name: "Party 1",
        team2Name: "Party 2",
      };
    }
  }, [round]);

  // ── Day 2 detection ──────────────────────────────────────────────────────

  const day2Config: Day2Config | null = useMemo(() => {
    if (!round?.ruleSet) return null;
    const rulesJson = round.ruleSet.rulesJson as any;
    if (!rulesJson?.day2Config) return null;
    return rulesJson.day2Config as Day2Config;
  }, [round?.ruleSet]);

  const isDay2 = day2Config !== null;

  // ── Permission check ───────────────────────────────────────────────────────

  const canEdit = useCallback(
    (playerId: number): boolean => {
      if (isAdmin) return true;
      if (!round?.tournamentId) return true; // no tournament = open
      return canEditPlayer(round.tournamentId, playerId);
    },
    [isAdmin, round?.tournamentId, canEditPlayer]
  );

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!round) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
          <p className="text-lg font-medium text-gray-700">
            {subscription.status === "connecting" ? "Connecting..." : "Loading round..."}
          </p>
        </div>
      </div>
    );
  }

  // ── Tab definitions ────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = isDay2
    ? [
        { id: "matchplay", label: "Leaderboard" },
        { id: "seg1", label: "Seg 1 (1-6)" },
        { id: "seg2", label: "Seg 2 (7-12)" },
        { id: "seg3", label: "Seg 3 (13-18)" },
      ]
    : [
        { id: "leaderboard", label: "Leaderboard" },
        { id: "party1", label: team1Name },
        { id: "party2", label: team2Name },
      ];

  // Reset active tab if switching between day1/day2 context and current tab is invalid
  const validTabIds = tabs.map((t) => t.id);
  const effectiveTab = validTabIds.includes(activeTab) ? activeTab : (tabs[0]?.id ?? "leaderboard");

  return (
    <div className="mx-auto max-w-7xl px-2 py-4 sm:px-4 lg:px-8">
      {preview && (
        <div className="mb-4 rounded-xl bg-blue-600 p-3 text-center text-white shadow-lg">
          <p className="font-semibold">Preview Mode - Scores will not be saved</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="mb-4 flex space-x-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              effectiveTab === tab.id
                ? "bg-green-600 text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — Day 1 */}
      {!isDay2 && effectiveTab === "leaderboard" && (
        <LeaderboardTab
          round={round}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
        />
      )}
      {!isDay2 && effectiveTab === "party1" && (
        <ScorecardTab
          round={round}
          partyPlayers={team1}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
        />
      )}
      {!isDay2 && effectiveTab === "party2" && (
        <ScorecardTab
          round={round}
          partyPlayers={team2}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
        />
      )}

      {/* Tab content — Day 2 Matchplay */}
      {isDay2 && effectiveTab === "matchplay" && (
        <MatchplayLeaderboardTab
          round={round}
          day2Config={day2Config!}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
        />
      )}
      {isDay2 && effectiveTab === "seg1" && (
        <SegmentTab
          round={round}
          day2Config={day2Config!}
          segmentNumber={1}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
        />
      )}
      {isDay2 && effectiveTab === "seg2" && (
        <SegmentTab
          round={round}
          day2Config={day2Config!}
          segmentNumber={2}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
        />
      )}
      {isDay2 && effectiveTab === "seg3" && (
        <SegmentTab
          round={round}
          day2Config={day2Config!}
          segmentNumber={3}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
        />
      )}

      {/* Score entry modal */}
      {scoreModal && (
        <ScoreEntryModal
          playerName={scoreModal.playerName}
          holeNumber={scoreModal.holeNumber}
          currentScore={getPlayerScore(scoreModal.playerId, scoreModal.holeNumber)}
          isPending={enterScoreMutation.isPending}
          onSelect={(strokes) => {
            enterScoreMutation.mutate({
              roundId: parseInt(roundId),
              playerId: scoreModal.playerId,
              holeNumber: scoreModal.holeNumber,
              strokes,
              requestingPlayerId: requestingPlayerId || undefined,
              isAdmin,
            });
          }}
          onClose={() => setScoreModal(null)}
        />
      )}
    </div>
  );
}

// ─── Day 2 Helpers ──────────────────────────────────────────────────────────

/** Get the player object (from round.players) by position index (0-5) */
function getPlayerByIndex(round: any, playerIndex: number) {
  const rp = round.players.find((p: any) => p.position === playerIndex);
  return rp || null;
}

/** Get the team info for a player index */
function getTeamForPlayerIndex(round: any, playerIndex: number) {
  const rp = getPlayerByIndex(round, playerIndex);
  if (!rp) return null;
  return {
    teamId: rp.teamId,
    teamName: (rp as any).team?.name || "",
    teamColor: (rp as any).team?.color || "#059669",
  };
}

/** Calculate net score for a player over a range of holes */
function calculateNetScoreForHoles(
  playerId: number,
  holes: number[],
  getPlayerScore: (pid: number, hole: number) => number | undefined,
  getHoleData: (hole: number) => HoleInfo | undefined,
  getStrokesReceivedForHole: (hole: number, handicap: number) => number,
  handicap: number,
): { netScore: number; grossScore: number; holesPlayed: number; allHolesEntered: boolean } {
  let grossScore = 0;
  let totalPar = 0;
  let totalStrokesReceived = 0;
  let holesPlayed = 0;

  for (const h of holes) {
    const score = getPlayerScore(playerId, h);
    if (score !== undefined) {
      const hd = getHoleData(h);
      grossScore += score;
      totalPar += hd?.par || 4;
      totalStrokesReceived += getStrokesReceivedForHole(h, handicap);
      holesPlayed++;
    }
  }

  const gross = grossScore - totalPar;
  const netScore = gross - totalStrokesReceived;

  return {
    netScore,
    grossScore,
    holesPlayed,
    allHolesEntered: holesPlayed === holes.length,
  };
}

// ─── Matchplay Leaderboard Tab ──────────────────────────────────────────────

function MatchplayLeaderboardTab({
  round,
  day2Config,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
}: {
  round: any;
  day2Config: Day2Config;
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
}) {
  // Segment holes mapping
  const segmentHoles: Record<number, number[]> = {
    1: [1, 2, 3, 4, 5, 6],
    2: [7, 8, 9, 10, 11, 12],
    3: [13, 14, 15, 16, 17, 18],
  };

  // Calculate match results
  const matchResults = useMemo(() => {
    return day2Config.matches.map((match) => {
      const holes = segmentHoles[match.segmentNumber] || [];
      const rp1 = getPlayerByIndex(round, match.player1Index);
      const rp2 = getPlayerByIndex(round, match.player2Index);

      if (!rp1 || !rp2) {
        return {
          match,
          player1: null,
          player2: null,
          player1Net: null,
          player2Net: null,
          status: "not-started" as const,
          result: null,
        };
      }

      const p1 = rp1.player;
      const p2 = rp2.player;

      const p1Stats = calculateNetScoreForHoles(
        p1.id, holes, getPlayerScore, getHoleData, getStrokesReceivedForHole, p1.handicap || 0
      );
      const p2Stats = calculateNetScoreForHoles(
        p2.id, holes, getPlayerScore, getHoleData, getStrokesReceivedForHole, p2.handicap || 0
      );

      const isBlind = match.type === "blind";
      const bothComplete = p1Stats.allHolesEntered && p2Stats.allHolesEntered;
      const eitherStarted = p1Stats.holesPlayed > 0 || p2Stats.holesPlayed > 0;

      let status: "not-started" | "in-progress" | "complete";
      if (!eitherStarted) {
        status = "not-started";
      } else if (bothComplete) {
        status = "complete";
      } else {
        status = "in-progress";
      }

      // For blind matches, hide net scores until both players have entered all holes
      const showScores = !isBlind || bothComplete;

      let result: { player1Points: number; player2Points: number } | null = null;
      if (bothComplete) {
        if (p1Stats.netScore < p2Stats.netScore) {
          result = { player1Points: 1, player2Points: 0 };
        } else if (p2Stats.netScore < p1Stats.netScore) {
          result = { player1Points: 0, player2Points: 1 };
        } else {
          result = { player1Points: 0.5, player2Points: 0.5 };
        }
      }

      return {
        match,
        player1: { rp: rp1, player: p1, stats: p1Stats },
        player2: { rp: rp2, player: p2, stats: p2Stats },
        player1Net: showScores ? p1Stats.netScore : null,
        player2Net: showScores ? p2Stats.netScore : null,
        status,
        result,
      };
    });
  }, [round, day2Config, getPlayerScore, getHoleData, getStrokesReceivedForHole]);

  // Build team standings from match results
  const teamStandings = useMemo(() => {
    const teamPoints = new Map<number, { name: string; color: string; points: number; matchesPlayed: number; matchesTotal: number }>();

    for (const mr of matchResults) {
      if (!mr.player1 || !mr.player2) continue;

      const team1Info = getTeamForPlayerIndex(round, mr.match.player1Index);
      const team2Info = getTeamForPlayerIndex(round, mr.match.player2Index);

      // Initialize teams
      for (const tInfo of [team1Info, team2Info]) {
        if (tInfo && !teamPoints.has(tInfo.teamId)) {
          teamPoints.set(tInfo.teamId, {
            name: tInfo.teamName,
            color: tInfo.teamColor,
            points: 0,
            matchesPlayed: 0,
            matchesTotal: 0,
          });
        }
      }

      if (team1Info) teamPoints.get(team1Info.teamId)!.matchesTotal++;
      if (team2Info) teamPoints.get(team2Info.teamId)!.matchesTotal++;

      if (mr.result) {
        if (team1Info) {
          teamPoints.get(team1Info.teamId)!.points += mr.result.player1Points;
          teamPoints.get(team1Info.teamId)!.matchesPlayed++;
        }
        if (team2Info) {
          teamPoints.get(team2Info.teamId)!.points += mr.result.player2Points;
          teamPoints.get(team2Info.teamId)!.matchesPlayed++;
        }
      }
    }

    return Array.from(teamPoints.entries())
      .map(([id, data]) => ({ teamId: id, ...data }))
      .sort((a, b) => b.points - a.points);
  }, [matchResults, round]);

  // Group matches by segment
  const matchesBySegment = useMemo(() => {
    const grouped: Record<number, typeof matchResults> = { 1: [], 2: [], 3: [] };
    for (const mr of matchResults) {
      const seg = mr.match.segmentNumber;
      if (grouped[seg]) grouped[seg].push(mr);
    }
    return grouped;
  }, [matchResults]);

  const formatNetScore = (net: number | null): string => {
    if (net === null) return "?";
    if (net === 0) return "E";
    return net > 0 ? `+${net}` : `${net}`;
  };

  return (
    <div className="space-y-6">
      {/* Team Standings */}
      {teamStandings.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Team Standings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-2 pr-4 text-left font-semibold text-gray-700">#</th>
                  <th className="py-2 pr-4 text-left font-semibold text-gray-700">Team</th>
                  <th className="py-2 text-center font-semibold text-gray-700">Matches</th>
                  <th className="py-2 text-center font-semibold text-gray-700">Points</th>
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((t, idx) => (
                  <tr key={t.teamId} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-bold text-gray-900">{idx + 1}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center space-x-2">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-semibold text-gray-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center text-gray-600">
                      {t.matchesPlayed}/{t.matchesTotal}
                    </td>
                    <td className="py-3 text-center text-lg font-bold text-green-600">
                      {t.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Match Results by Segment */}
      {[1, 2, 3].map((seg) => {
        const segMatches = matchesBySegment[seg] || [];
        const holeRange = segmentHoles[seg] || [];
        return (
          <div key={seg} className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              Segment {seg} — Holes {holeRange[0]}-{holeRange[holeRange.length - 1]}
            </h2>
            <div className="space-y-3">
              {segMatches.map((mr, idx) => {
                const team1Info = mr.player1 ? getTeamForPlayerIndex(round, mr.match.player1Index) : null;
                const team2Info = mr.player2 ? getTeamForPlayerIndex(round, mr.match.player2Index) : null;

                return (
                  <div
                    key={mr.match.id || idx}
                    className="rounded-xl border border-gray-200 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          mr.match.type === "blind"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {mr.match.type === "blind" ? "Blind" : "Live"}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          mr.status === "complete"
                            ? "text-green-600"
                            : mr.status === "in-progress"
                            ? "text-amber-600"
                            : "text-gray-400"
                        }`}
                      >
                        {mr.status === "complete"
                          ? "Complete"
                          : mr.status === "in-progress"
                          ? "In progress"
                          : "Not started"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      {/* Player 1 */}
                      <div className="flex items-center space-x-2">
                        {team1Info && (
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: team1Info.teamColor }}
                          />
                        )}
                        <span className="text-sm font-semibold text-gray-900">
                          {mr.player1?.player.name || "TBD"}
                        </span>
                        <span className="text-sm font-bold text-purple-600">
                          {formatNetScore(mr.player1Net)}
                        </span>
                      </div>

                      <span className="px-2 text-xs font-medium text-gray-400">vs</span>

                      {/* Player 2 */}
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-purple-600">
                          {formatNetScore(mr.player2Net)}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {mr.player2?.player.name || "TBD"}
                        </span>
                        {team2Info && (
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: team2Info.teamColor }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Result */}
                    {mr.result && (
                      <div className="mt-2 text-center text-xs font-semibold">
                        {mr.result.player1Points === 1 ? (
                          <span className="text-green-600">
                            {mr.player1?.player.name} wins (1 pt)
                          </span>
                        ) : mr.result.player2Points === 1 ? (
                          <span className="text-green-600">
                            {mr.player2?.player.name} wins (1 pt)
                          </span>
                        ) : (
                          <span className="text-amber-600">Tie (0.5 pts each)</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segment Tab (Day 2 Mini Scorecards) ────────────────────────────────────

function SegmentTab({
  round,
  day2Config,
  segmentNumber,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  canEdit,
  onCellTap,
}: {
  round: any;
  day2Config: Day2Config;
  segmentNumber: number;
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  canEdit: (playerId: number) => boolean;
  onCellTap: (playerId: number, holeNumber: number, playerName: string) => void;
}) {
  const segmentMatches = useMemo(
    () => day2Config.matches.filter((m) => m.segmentNumber === segmentNumber),
    [day2Config, segmentNumber]
  );

  const holes = useMemo(() => {
    const start = (segmentNumber - 1) * 6 + 1;
    return Array.from({ length: 6 }, (_, i) => start + i);
  }, [segmentNumber]);

  return (
    <div className="space-y-6">
      {segmentMatches.map((match, idx) => (
        <MiniScorecard
          key={match.id || idx}
          round={round}
          match={match}
          holes={holes}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={onCellTap}
        />
      ))}
    </div>
  );
}

// ─── Mini Scorecard (6-hole, 2 players, with winner row) ────────────────────

function MiniScorecard({
  round,
  match,
  holes,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  canEdit,
  onCellTap,
}: {
  round: any;
  match: Day2Match;
  holes: number[];
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  canEdit: (playerId: number) => boolean;
  onCellTap: (playerId: number, holeNumber: number, playerName: string) => void;
}) {
  const rp1 = getPlayerByIndex(round, match.player1Index);
  const rp2 = getPlayerByIndex(round, match.player2Index);

  if (!rp1 || !rp2) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-lg">
        <p className="text-gray-500">Match data unavailable</p>
      </div>
    );
  }

  const p1 = rp1.player;
  const p2 = rp2.player;
  const p1Handicap = p1.handicap || 0;
  const p2Handicap = p2.handicap || 0;
  const isBlind = match.type === "blind";

  const team1Info = getTeamForPlayerIndex(round, match.player1Index);
  const team2Info = getTeamForPlayerIndex(round, match.player2Index);

  // Score indicator symbols
  const getScoreSymbol = (
    strokes: number,
    par: number
  ): { className: string } => {
    const diff = strokes - par;
    if (diff <= -2) return { className: "text-red-600 font-bold ring-2 ring-red-400 ring-offset-1 rounded-full" };
    if (diff === -1) return { className: "text-red-600 font-bold ring-1 ring-red-400 rounded-full" };
    if (diff === 1) return { className: "text-gray-900 font-bold ring-1 ring-gray-900 rounded-sm" };
    if (diff >= 2) return { className: "text-gray-900 font-bold ring-2 ring-gray-900 rounded-sm" };
    return { className: "text-gray-900" };
  };

  // For blind matches: determine visibility per hole
  // A hole's scores are visible only if BOTH players have entered that hole
  const holeVisibility = useMemo(() => {
    return holes.map((h) => {
      const p1Score = getPlayerScore(p1.id, h);
      const p2Score = getPlayerScore(p2.id, h);
      const p1Entered = p1Score !== undefined;
      const p2Entered = p2Score !== undefined;
      return {
        hole: h,
        bothEntered: p1Entered && p2Entered,
        p1Entered,
        p2Entered,
      };
    });
  }, [holes, p1.id, p2.id, getPlayerScore]);

  // Compute net score per hole for winner determination
  const holeWinners = useMemo(() => {
    return holes.map((h, idx) => {
      const vis = holeVisibility[idx];
      if (!vis || !vis.bothEntered) return null; // Can't determine winner
      if (isBlind && !vis.bothEntered) return null;

      const p1Score = getPlayerScore(p1.id, h)!;
      const p2Score = getPlayerScore(p2.id, h)!;
      const hd = getHoleData(h);
      const par = hd?.par || 4;

      const p1StrokesReceived = getStrokesReceivedForHole(h, p1Handicap);
      const p2StrokesReceived = getStrokesReceivedForHole(h, p2Handicap);

      const p1Net = p1Score - p1StrokesReceived;
      const p2Net = p2Score - p2StrokesReceived;

      if (p1Net < p2Net) return "p1";
      if (p2Net < p1Net) return "p2";
      return "tie";
    });
  }, [holes, holeVisibility, isBlind, p1.id, p2.id, p1Handicap, p2Handicap, getPlayerScore, getHoleData, getStrokesReceivedForHole]);

  // Overall match result
  const matchSummary = useMemo(() => {
    const p1Stats = calculateNetScoreForHoles(
      p1.id, holes, getPlayerScore, getHoleData, getStrokesReceivedForHole, p1Handicap
    );
    const p2Stats = calculateNetScoreForHoles(
      p2.id, holes, getPlayerScore, getHoleData, getStrokesReceivedForHole, p2Handicap
    );
    return { p1Stats, p2Stats, bothComplete: p1Stats.allHolesEntered && p2Stats.allHolesEntered };
  }, [p1.id, p2.id, p1Handicap, p2Handicap, holes, getPlayerScore, getHoleData, getStrokesReceivedForHole]);

  // Totals
  const computeSum = (playerId: number): number | null => {
    let sum = 0;
    let hasAny = false;
    for (const h of holes) {
      const s = getPlayerScore(playerId, h);
      if (s !== undefined) {
        sum += s;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  };

  const p1Total = computeSum(p1.id);
  const p2Total = computeSum(p2.id);

  const cellClass = "min-w-[40px] px-1 py-1 text-center text-xs";
  const headerCellClass = "min-w-[40px] px-1 py-1 text-center text-xs font-semibold";
  const nameCellClass =
    "sticky left-0 z-10 bg-white min-w-[100px] max-w-[130px] px-2 py-1 text-xs font-semibold whitespace-nowrap";
  const sumCellClass = "min-w-[44px] px-1 py-1 text-center text-xs font-bold";

  /** Render a score cell, respecting blind visibility */
  const renderScoreCell = (
    playerId: number,
    playerName: string,
    holeNumber: number,
    handicap: number,
    isPlayerEditable: boolean,
    holeIdx: number,
  ) => {
    const score = getPlayerScore(playerId, holeNumber);
    const vis = holeVisibility[holeIdx];
    const isThisPlayer1 = playerId === p1.id;
    const thisPlayerEntered = isThisPlayer1 ? vis?.p1Entered : vis?.p2Entered;

    // For blind matches, show special display
    if (isBlind && !vis?.bothEntered) {
      return (
        <td
          key={holeNumber}
          className={`${cellClass} cursor-pointer hover:bg-green-50`}
          onClick={() => isPlayerEditable && onCellTap(playerId, holeNumber, playerName)}
        >
          {thisPlayerEntered ? (
            <span className="inline-flex h-6 w-6 items-center justify-center text-green-500 font-medium">
              &#10003;
            </span>
          ) : (
            <span className="text-gray-300">&ndash;</span>
          )}
        </td>
      );
    }

    // Normal display (live match or both entered for blind)
    const hd = getHoleData(holeNumber);
    const par = hd?.par ?? 4;
    const sym = score !== undefined ? getScoreSymbol(score, par) : null;

    return (
      <td
        key={holeNumber}
        className={`${cellClass} cursor-pointer hover:bg-green-50`}
        onClick={() => isPlayerEditable && onCellTap(playerId, holeNumber, playerName)}
      >
        {score !== undefined ? (
          <span
            className={`inline-flex h-6 w-6 items-center justify-center ${sym?.className ?? ""}`}
          >
            {score}
          </span>
        ) : (
          <span className="text-gray-300">&ndash;</span>
        )}
      </td>
    );
  };

  /** Render blind-aware total */
  const renderTotal = (playerId: number) => {
    if (isBlind) {
      // For blind, show total only if all holes visible (both entered all)
      const allVisible = holeVisibility.every((v) => v.bothEntered);
      if (!allVisible) return <span className="text-gray-400">?</span>;
    }
    const total = playerId === p1.id ? p1Total : p2Total;
    return total !== null ? total : "-";
  };

  return (
    <div className="rounded-2xl bg-white shadow-lg overflow-hidden">
      {/* Match header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center space-x-2">
          {team1Info && (
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team1Info.teamColor }} />
          )}
          <span className="text-sm font-bold text-gray-900">{p1.name}</span>
          <span className="text-xs text-gray-400">vs</span>
          <span className="text-sm font-bold text-gray-900">{p2.name}</span>
          {team2Info && (
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team2Info.teamColor }} />
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            isBlind ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {isBlind ? "Blind" : "Live"}
        </span>
      </div>

      {/* Scorecard table */}
      <div className="overflow-x-auto">
        <table className="w-max border-collapse">
          <thead>
            {/* Hole number row */}
            <tr className="border-b border-gray-300 bg-gray-50">
              <th className={`${nameCellClass} bg-gray-50`}>Hole</th>
              {holes.map((h) => (
                <th key={h} className={`${headerCellClass} text-gray-700`}>
                  {h}
                </th>
              ))}
              <th className={`${headerCellClass} bg-gray-100 text-gray-900`}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-600`}>Par</td>
              {holes.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-600`}>
                    {hd?.par ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
                {holeDataArray.length > 0
                  ? holes.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0)
                  : "-"}
              </td>
            </tr>

            {/* SI row */}
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-500`}>SI</td>
              {holes.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-500`}>
                    {hd?.strokeIndex ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>

            {/* Player 1 score row */}
            <tr className="border-b border-gray-100">
              <td className={`${nameCellClass} truncate`}>
                <div className="leading-tight">
                  <div className="flex items-center space-x-1">
                    {team1Info && (
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: team1Info.teamColor }} />
                    )}
                    <span className="truncate">{p1.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">HCP {p1Handicap}</div>
                </div>
              </td>
              {holes.map((h, idx) =>
                renderScoreCell(p1.id, p1.name, h, p1Handicap, canEdit(p1.id), idx)
              )}
              <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
                {renderTotal(p1.id)}
              </td>
            </tr>

            {/* Player 1 strokes received row */}
            <tr className="border-b-2 border-gray-200 bg-purple-50/50">
              <td className={`${nameCellClass} bg-purple-50/50 text-[10px] text-purple-600`}>
                Strokes
              </td>
              {holes.map((h) => {
                const sr = getStrokesReceivedForHole(h, p1Handicap);
                return (
                  <td key={h} className={`${cellClass} text-[10px] text-purple-500`}>
                    {sr > 0 ? sr : "0"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>

            {/* Player 2 score row */}
            <tr className="border-b border-gray-100">
              <td className={`${nameCellClass} truncate`}>
                <div className="leading-tight">
                  <div className="flex items-center space-x-1">
                    {team2Info && (
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: team2Info.teamColor }} />
                    )}
                    <span className="truncate">{p2.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">HCP {p2Handicap}</div>
                </div>
              </td>
              {holes.map((h, idx) =>
                renderScoreCell(p2.id, p2.name, h, p2Handicap, canEdit(p2.id), idx)
              )}
              <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
                {renderTotal(p2.id)}
              </td>
            </tr>

            {/* Player 2 strokes received row */}
            <tr className="border-b-2 border-gray-200 bg-purple-50/50">
              <td className={`${nameCellClass} bg-purple-50/50 text-[10px] text-purple-600`}>
                Strokes
              </td>
              {holes.map((h) => {
                const sr = getStrokesReceivedForHole(h, p2Handicap);
                return (
                  <td key={h} className={`${cellClass} text-[10px] text-purple-500`}>
                    {sr > 0 ? sr : "0"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>

            {/* Winner row */}
            <tr className="bg-green-50/50">
              <td className={`${nameCellClass} bg-green-50/50 text-[10px] text-green-700 font-semibold`}>
                Winner
              </td>
              {holes.map((h, idx) => {
                const winner = holeWinners[idx];
                let content: React.ReactNode = <span className="text-gray-300">&ndash;</span>;
                let cellBg = "";

                if (winner === "p1") {
                  const color1 = team1Info?.teamColor || "#059669";
                  content = (
                    <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: color1 }} />
                  );
                  cellBg = "bg-green-100/50";
                } else if (winner === "p2") {
                  const color2 = team2Info?.teamColor || "#059669";
                  content = (
                    <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: color2 }} />
                  );
                  cellBg = "bg-green-100/50";
                } else if (winner === "tie") {
                  content = (
                    <span className="text-xs font-semibold text-amber-600">T</span>
                  );
                }

                return (
                  <td key={h} className={`${cellClass} ${cellBg}`}>
                    {content}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100`}>
                {matchSummary.bothComplete ? (
                  matchSummary.p1Stats.netScore < matchSummary.p2Stats.netScore ? (
                    <span className="text-xs font-bold text-green-700">{p1.name.split(" ")[0]}</span>
                  ) : matchSummary.p2Stats.netScore < matchSummary.p1Stats.netScore ? (
                    <span className="text-xs font-bold text-green-700">{p2.name.split(" ")[0]}</span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600">Tie</span>
                  )
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Leaderboard Tab ─────────────────────────────────────────────────────────

function LeaderboardTab({
  round,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
}: {
  round: any;
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
}) {
  // Build individual standings
  const individualStandings = useMemo(() => {
    return round.players
      .map((rp: any) => {
        const player = rp.player;
        const handicap = player.handicap || 0;

        let totalStrokes = 0;
        let totalPar = 0;
        let totalStrokesReceived = 0;
        let lastHole = 0;
        let holesPlayed = 0;

        for (let h = 1; h <= 18; h++) {
          const score = getPlayerScore(player.id, h);
          if (score !== undefined) {
            const hd = getHoleData(h);
            totalStrokes += score;
            totalPar += hd?.par || 4;
            totalStrokesReceived += getStrokesReceivedForHole(h, handicap);
            if (h > lastHole) lastHole = h;
            holesPlayed++;
          }
        }

        const gross = totalStrokes - totalPar; // relative to par
        const net = gross - totalStrokesReceived; // gross minus handicap strokes

        return {
          playerId: player.id,
          playerName: player.name,
          teamName: (rp as any).team?.name || "",
          teamId: rp.teamId,
          handicap,
          lastHole,
          holesPlayed,
          gross,
          net,
        };
      })
      .sort((a: any, b: any) => {
        // Sort by net score ascending (lower is better)
        if (a.net !== b.net) return a.net - b.net;
        return a.gross - b.gross;
      });
  }, [round, getPlayerScore, getStrokesReceivedForHole]);

  // Calculate position-based points (6-5-4-3-2-1)
  // Ties: split the sum of tied positions' points equally
  const standingsWithPoints = useMemo(() => {
    const pointsMap = [6, 5, 4, 3, 2, 1];
    const withScores = individualStandings.filter((s: any) => s.holesPlayed > 0);
    const withoutScores = individualStandings.filter((s: any) => s.holesPlayed === 0);

    const result: any[] = [];
    let pos = 0;
    while (pos < withScores.length) {
      const currentNet = withScores[pos].net;
      let tieCount = 0;
      while (pos + tieCount < withScores.length && withScores[pos + tieCount].net === currentNet) {
        tieCount++;
      }
      let totalPts = 0;
      for (let i = 0; i < tieCount; i++) {
        const idx = pos + i;
        totalPts += idx < pointsMap.length ? (pointsMap[idx] ?? 0) : 0;
      }
      const sharedPts = totalPts / tieCount;
      for (let i = 0; i < tieCount; i++) {
        result.push({ ...withScores[pos + i], rank: pos + 1, pts: sharedPts });
      }
      pos += tieCount;
    }

    for (const s of withoutScores) {
      result.push({ ...s, rank: "-", pts: 0 });
    }

    return result;
  }, [individualStandings]);

  // Build team standings
  const teamStandings = useMemo(() => {
    const teamTotals = new Map<number, { name: string; totalPts: number; color: string }>();

    for (const s of standingsWithPoints) {
      if (s.teamId) {
        if (!teamTotals.has(s.teamId)) {
          const teamInfo = round.players.find(
            (rp: any) => rp.teamId === s.teamId
          );
          const color = (teamInfo as any)?.team?.color || "#059669";
          teamTotals.set(s.teamId, { name: s.teamName, totalPts: 0, color });
        }
        teamTotals.get(s.teamId)!.totalPts += s.pts;
      }
    }

    return Array.from(teamTotals.entries())
      .map(([id, data]) => ({ teamId: id, ...data }))
      .sort((a, b) => b.totalPts - a.totalPts);
  }, [standingsWithPoints, round.players]);

  return (
    <div className="space-y-6">
      {/* Team Standings */}
      {teamStandings.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Team Standings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-2 pr-4 text-left font-semibold text-gray-700">#</th>
                  <th className="py-2 pr-4 text-left font-semibold text-gray-700">Team</th>
                  <th className="py-2 text-center font-semibold text-gray-700">Total Pts</th>
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((t, idx) => (
                  <tr key={t.teamId} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-bold text-gray-900">{idx + 1}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center space-x-2">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-semibold text-gray-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center text-lg font-bold text-green-600">
                      {t.totalPts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual Standings */}
      <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Individual Standings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-2 pr-2 text-left font-semibold text-gray-700">#</th>
                <th className="py-2 pr-2 text-left font-semibold text-gray-700">Player</th>
                <th className="py-2 pr-2 text-left font-semibold text-gray-700">Team</th>
                <th className="py-2 text-center font-semibold text-gray-700">HCP</th>
                <th className="py-2 text-center font-semibold text-gray-700">Hole</th>
                <th className="py-2 text-center font-semibold text-gray-700">Gross</th>
                <th className="py-2 text-center font-semibold text-gray-700">Net</th>
                <th className="py-2 text-center font-semibold text-gray-700">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standingsWithPoints.map((s: any) => (
                <tr key={s.playerId} className="border-b border-gray-100">
                  <td className="py-3 pr-2 font-bold text-gray-900">{s.rank}</td>
                  <td className="py-3 pr-2 font-semibold text-gray-900 whitespace-nowrap">
                    {s.playerName}
                  </td>
                  <td className="py-3 pr-2 text-gray-600 whitespace-nowrap">{s.teamName}</td>
                  <td className="py-3 text-center text-gray-600">{s.handicap}</td>
                  <td className="py-3 text-center text-gray-600">
                    {s.lastHole > 0 ? s.lastHole : "-"}
                  </td>
                  <td className="py-3 text-center font-semibold text-gray-900">
                    {s.holesPlayed > 0 ? (s.gross === 0 ? "E" : s.gross > 0 ? `+${s.gross}` : s.gross) : "-"}
                  </td>
                  <td className="py-3 text-center font-semibold text-purple-600">
                    {s.holesPlayed > 0 ? (s.net === 0 ? "E" : s.net > 0 ? `+${s.net}` : s.net) : "-"}
                  </td>
                  <td className="py-3 text-center font-bold text-green-600">{s.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Scorecard Tab (Paper-style) ─────────────────────────────────────────────

function ScorecardTab({
  round,
  partyPlayers,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  canEdit,
  onCellTap,
}: {
  round: any;
  partyPlayers: any[];
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  canEdit: (playerId: number) => boolean;
  onCellTap: (playerId: number, holeNumber: number, playerName: string) => void;
}) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);

  // Score indicator symbols
  const getScoreSymbol = (
    strokes: number,
    par: number
  ): { prefix: string; suffix: string; className: string } => {
    const diff = strokes - par;
    if (diff <= -2) return { prefix: "", suffix: "", className: "text-red-600 font-bold ring-2 ring-red-400 ring-offset-1 rounded-full" }; // eagle+
    if (diff === -1) return { prefix: "", suffix: "", className: "text-red-600 font-bold ring-1 ring-red-400 rounded-full" }; // birdie
    if (diff === 1) return { prefix: "", suffix: "", className: "text-gray-900 font-bold ring-1 ring-gray-900 rounded-sm" }; // bogey
    if (diff >= 2) return { prefix: "", suffix: "", className: "text-gray-900 font-bold ring-2 ring-gray-900 rounded-sm" }; // double bogey+
    return { prefix: "", suffix: "", className: "text-gray-900" }; // par
  };

  const computeSum = (playerId: number, holeRange: number[]): number | null => {
    let sum = 0;
    let hasAny = false;
    for (const h of holeRange) {
      const s = getPlayerScore(playerId, h);
      if (s !== undefined) {
        sum += s;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  };

  // Minimum cell width for holes
  const cellClass = "min-w-[36px] px-1 py-1 text-center text-xs";
  const headerCellClass = "min-w-[36px] px-1 py-1 text-center text-xs font-semibold";
  const nameCellClass =
    "sticky left-0 z-10 bg-white min-w-[90px] max-w-[120px] px-2 py-1 text-xs font-semibold whitespace-nowrap";
  const sumCellClass = "min-w-[40px] px-1 py-1 text-center text-xs font-bold";

  return (
    <div className="rounded-2xl bg-white shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-max border-collapse">
          <thead>
            {/* Hole number row */}
            <tr className="border-b border-gray-300 bg-gray-50">
              <th className={`${nameCellClass} bg-gray-50`}>Hole</th>
              {frontNine.map((h) => (
                <th key={h} className={`${headerCellClass} text-gray-700`}>
                  {h}
                </th>
              ))}
              <th className={`${headerCellClass} bg-green-50 text-green-800`}>OUT</th>
              {backNine.map((h) => (
                <th key={h} className={`${headerCellClass} text-gray-700`}>
                  {h}
                </th>
              ))}
              <th className={`${headerCellClass} bg-blue-50 text-blue-800`}>IN</th>
              <th className={`${headerCellClass} bg-gray-100 text-gray-900`}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-600`}>Par</td>
              {frontNine.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-600`}>
                    {hd?.par ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-green-50 text-green-800`}>
                {holeDataArray.length > 0
                  ? frontNine.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0)
                  : "-"}
              </td>
              {backNine.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-600`}>
                    {hd?.par ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-blue-50 text-blue-800`}>
                {holeDataArray.length > 0
                  ? backNine.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0)
                  : "-"}
              </td>
              <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
                {holeDataArray.length > 0
                  ? holes.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0)
                  : "-"}
              </td>
            </tr>

            {/* SI (stroke index) row */}
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-500`}>SI</td>
              {frontNine.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-500`}>
                    {hd?.strokeIndex ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-green-50`} />
              {backNine.map((h) => {
                const hd = getHoleData(h);
                return (
                  <td key={h} className={`${cellClass} text-gray-500`}>
                    {hd?.strokeIndex ?? "-"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-blue-50`} />
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>

            {/* Player rows */}
            {partyPlayers.map((rp: any) => {
              const player = rp.player;
              const handicap = player.handicap || 0;
              const outSum = computeSum(player.id, frontNine);
              const inSum = computeSum(player.id, backNine);
              const total = outSum !== null || inSum !== null ? (outSum ?? 0) + (inSum ?? 0) : null;

              return (
                <PlayerScorecardRows
                  key={player.id}
                  player={player}
                  handicap={handicap}
                  frontNine={frontNine}
                  backNine={backNine}
                  holes={holes}
                  getHoleData={getHoleData}
                  getPlayerScore={getPlayerScore}
                  getStrokesReceivedForHole={getStrokesReceivedForHole}
                  getScoreSymbol={getScoreSymbol}
                  outSum={outSum}
                  inSum={inSum}
                  total={total}
                  canEdit={canEdit(player.id)}
                  onCellTap={onCellTap}
                  cellClass={cellClass}
                  nameCellClass={nameCellClass}
                  sumCellClass={sumCellClass}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Player scorecard rows (score + strokes received) ────────────────────────

function PlayerScorecardRows({
  player,
  handicap,
  frontNine,
  backNine,
  holes,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  getScoreSymbol,
  outSum,
  inSum,
  total,
  canEdit,
  onCellTap,
  cellClass,
  nameCellClass,
  sumCellClass,
}: {
  player: any;
  handicap: number;
  frontNine: number[];
  backNine: number[];
  holes: number[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  getScoreSymbol: (
    strokes: number,
    par: number
  ) => { prefix: string; suffix: string; className: string };
  outSum: number | null;
  inSum: number | null;
  total: number | null;
  canEdit: boolean;
  onCellTap: (playerId: number, holeNumber: number, playerName: string) => void;
  cellClass: string;
  nameCellClass: string;
  sumCellClass: string;
}) {
  return (
    <>
      {/* Score row */}
      <tr className="border-b border-gray-100">
        <td className={`${nameCellClass} truncate`}>
          <div className="leading-tight">
            <div className="truncate">{player.name}</div>
            <div className="text-[10px] text-gray-500">HCP {handicap}</div>
          </div>
        </td>
        {frontNine.map((h) => {
          const score = getPlayerScore(player.id, h);
          const hd = getHoleData(h);
          const par = hd?.par ?? 4;
          const sym = score !== undefined ? getScoreSymbol(score, par) : null;

          return (
            <td
              key={h}
              className={`${cellClass} cursor-pointer hover:bg-green-50`}
              onClick={() => canEdit && onCellTap(player.id, h, player.name)}
            >
              {score !== undefined ? (
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center ${sym?.className ?? ""}`}
                >
                  {score}
                </span>
              ) : (
                <span className="text-gray-300">&ndash;</span>
              )}
            </td>
          );
        })}
        <td className={`${sumCellClass} bg-green-50 text-green-800`}>
          {outSum !== null ? outSum : "-"}
        </td>
        {backNine.map((h) => {
          const score = getPlayerScore(player.id, h);
          const hd = getHoleData(h);
          const par = hd?.par ?? 4;
          const sym = score !== undefined ? getScoreSymbol(score, par) : null;

          return (
            <td
              key={h}
              className={`${cellClass} cursor-pointer hover:bg-green-50`}
              onClick={() => canEdit && onCellTap(player.id, h, player.name)}
            >
              {score !== undefined ? (
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center ${sym?.className ?? ""}`}
                >
                  {score}
                </span>
              ) : (
                <span className="text-gray-300">&ndash;</span>
              )}
            </td>
          );
        })}
        <td className={`${sumCellClass} bg-blue-50 text-blue-800`}>
          {inSum !== null ? inSum : "-"}
        </td>
        <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
          {total !== null ? total : "-"}
        </td>
      </tr>

      {/* Strokes received row */}
      <tr className="border-b-2 border-gray-200 bg-purple-50/50">
        <td className={`${nameCellClass} bg-purple-50/50 text-[10px] text-purple-600`}>
          Strokes
        </td>
        {frontNine.map((h) => {
          const sr = getStrokesReceivedForHole(h, handicap);
          return (
            <td key={h} className={`${cellClass} text-[10px] text-purple-500`}>
              {sr > 0 ? sr : "0"}
            </td>
          );
        })}
        <td className={`${sumCellClass} bg-green-50`} />
        {backNine.map((h) => {
          const sr = getStrokesReceivedForHole(h, handicap);
          return (
            <td key={h} className={`${cellClass} text-[10px] text-purple-500`}>
              {sr > 0 ? sr : "0"}
            </td>
          );
        })}
        <td className={`${sumCellClass} bg-blue-50`} />
        <td className={`${sumCellClass} bg-gray-100`} />
      </tr>
    </>
  );
}

// ─── Score Entry Modal ───────────────────────────────────────────────────────

function ScoreEntryModal({
  playerName,
  holeNumber,
  currentScore,
  isPending,
  onSelect,
  onClose,
}: {
  playerName: string;
  holeNumber: number;
  currentScore: number | undefined;
  isPending: boolean;
  onSelect: (strokes: number) => void;
  onClose: () => void;
}) {
  const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <h3 className="text-lg font-bold text-gray-900">{playerName}</h3>
          <p className="text-sm text-gray-600">Hole {holeNumber}</p>
          {currentScore !== undefined && (
            <p className="mt-1 text-xs text-gray-500">Current: {currentScore}</p>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {scores.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              disabled={isPending}
              className={`rounded-xl py-3 text-lg font-bold transition-all ${
                currentScore === s
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-900 hover:bg-green-100 active:bg-green-200"
              } disabled:opacity-50`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
