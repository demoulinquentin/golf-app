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

type TabId = "leaderboard" | "party1" | "party2" | "matchplay" | "seg1" | "seg2" | "seg3" | "day3Leaderboard" | "day3Scorecard";

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

type Day3Config = {
  party1PlayerIndices: number[];
  party2PlayerIndices: number[];
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
    if ((activeTab !== "leaderboard" && activeTab !== "matchplay" && activeTab !== "day3Leaderboard") || preview) return;
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

  // ── Day 3 detection ──────────────────────────────────────────────────────

  const day3Config: Day3Config | null = useMemo(() => {
    if (!round?.ruleSet) return null;
    const rulesJson = round.ruleSet.rulesJson as any;
    if (!rulesJson?.day3Config) return null;
    return rulesJson.day3Config as Day3Config;
  }, [round?.ruleSet]);

  const isDay3 = day3Config !== null;

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
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#003d2e] border-t-transparent" />
          <p className="text-lg font-medium text-gray-700">
            {subscription.status === "connecting" ? "Connecting..." : "Loading round..."}
          </p>
        </div>
      </div>
    );
  }

  // ── Tab definitions ────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = isDay3
    ? [
        { id: "day3Leaderboard", label: "Leaderboard" },
        { id: "day3Scorecard", label: "Scorecard" },
      ]
    : isDay2
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
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 whitespace-nowrap rounded-full px-4 py-2.5 sm:py-2 text-sm font-semibold transition-all ${
              effectiveTab === tab.id
                ? "bg-[#003d2e] text-[#fff8e7] shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — Day 3 Best Ball */}
      {isDay3 && effectiveTab === "day3Leaderboard" && (
        <Day3LeaderboardTab
          round={round}
          day3Config={day3Config!}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          team1={team1}
          team2={team2}
          team1Name={team1Name}
          team2Name={team2Name}
        />
      )}
      {isDay3 && effectiveTab === "day3Scorecard" && (
        <Day3ScorecardTab
          round={round}
          day3Config={day3Config!}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
          canEdit={canEdit}
          onCellTap={(playerId, holeNumber, playerName) =>
            setScoreModal({ playerId, holeNumber, playerName })
          }
          team1={team1}
          team2={team2}
          team1Name={team1Name}
          team2Name={team2Name}
        />
      )}

      {/* Tab content — Day 1 */}
      {!isDay2 && !isDay3 && effectiveTab === "leaderboard" && (
        <LeaderboardTab
          round={round}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
        />
      )}
      {!isDay2 && !isDay3 && effectiveTab === "party1" && (
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
      {!isDay2 && !isDay3 && effectiveTab === "party2" && (
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
          holePar={getHoleData(scoreModal.holeNumber)?.par}
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

  // Calculate match results with hole-by-hole matchplay
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
          statusText: "Not started",
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

      // Hole-by-hole matchplay calculation
      let p1HolesWon = 0;
      let p2HolesWon = 0;
      let holesCompared = 0;
      let clinchHole: number | null = null;
      let clinchMargin = 0;
      let clinchRemaining = 0;

      for (let i = 0; i < holes.length; i++) {
        const h = holes[i]!;
        const p1Score = getPlayerScore(p1.id, h);
        const p2Score = getPlayerScore(p2.id, h);
        if (p1Score === undefined || p2Score === undefined) continue;

        const hd = getHoleData(h);
        const p1Sr = getStrokesReceivedForHole(h, p1.handicap || 0);
        const p2Sr = getStrokesReceivedForHole(h, p2.handicap || 0);
        const p1Net = p1Score - p1Sr;
        const p2Net = p2Score - p2Sr;

        holesCompared++;
        if (p1Net < p2Net) p1HolesWon++;
        else if (p2Net < p1Net) p2HolesWon++;

        // Check if match is clinched
        const margin = Math.abs(p1HolesWon - p2HolesWon);
        const holesLeft = holes.length - holesCompared;
        if (clinchHole === null && margin > holesLeft) {
          clinchHole = holesCompared;
          clinchMargin = margin;
          clinchRemaining = holesLeft;
        }
      }

      // Build status text
      let statusText = "Not started";
      if (!eitherStarted) {
        statusText = "Not started";
      } else if (isBlind && !bothComplete) {
        // For blind matches, don't reveal who's ahead
        statusText = "In progress";
      } else if (bothComplete || (holesCompared === holes.length)) {
        // Match complete
        const margin = Math.abs(p1HolesWon - p2HolesWon);
        if (margin === 0) {
          statusText = "Tie";
        } else {
          const winnerName = p1HolesWon > p2HolesWon ? p1.name : p2.name;
          if (clinchHole !== null && clinchRemaining > 0) {
            statusText = `${winnerName} wins ${clinchMargin}&${clinchRemaining}`;
          } else {
            statusText = `${winnerName} wins 1 UP`;
          }
        }
      } else {
        // In progress
        const margin = Math.abs(p1HolesWon - p2HolesWon);
        const holesLeft = holes.length - holesCompared;
        if (margin === 0) {
          statusText = `All Square (${holesLeft} left)`;
        } else {
          const leaderName = p1HolesWon > p2HolesWon ? p1.name : p2.name;
          statusText = `${leaderName} ${margin} UP (${holesLeft} left)`;
        }
      }

      let result: { player1Points: number; player2Points: number } | null = null;
      if (bothComplete) {
        if (p1HolesWon > p2HolesWon) {
          result = { player1Points: 1, player2Points: 0 };
        } else if (p2HolesWon > p1HolesWon) {
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
        statusText,
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
          <div key={seg} className="rounded-2xl bg-white shadow-lg sm:p-2 overflow-hidden">
            <h2 className="px-3 pt-4 pb-2 text-lg font-bold text-gray-900 sm:px-4">
              Segment {seg} — Holes {holeRange[0]}-{holeRange[holeRange.length - 1]}
            </h2>
            <div className="divide-y divide-gray-100">
              {segMatches.map((mr, idx) => {
                const team1Info = mr.player1 ? getTeamForPlayerIndex(round, mr.match.player1Index) : null;
                const team2Info = mr.player2 ? getTeamForPlayerIndex(round, mr.match.player2Index) : null;
                const player1Name = mr.player1?.player.name || "TBD";
                const player2Name = mr.player2?.player.name || "TBD";

                return (
                  <div key={mr.match.id || idx} className="grid grid-cols-[1fr_auto_3rem] items-center gap-2 px-3 py-2.5 sm:px-4">
                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                      {team1Info && (
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team1Info.teamColor }} />
                      )}
                      <span className="font-semibold text-gray-900 truncate">{player1Name}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">vs</span>
                      <span className="font-semibold text-gray-900 truncate">{player2Name}</span>
                      {team2Info && (
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team2Info.teamColor }} />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-gray-900 text-right whitespace-nowrap">{mr.statusText}</span>
                    <span
                      className={`text-center rounded-full px-1 py-0.5 text-[10px] font-semibold ${
                        mr.match.type === "blind"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {mr.match.type === "blind" ? "Blind" : "Live"}
                    </span>
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

  const cellClass = "min-w-[40px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs";
  const headerCellClass = "min-w-[40px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-semibold";
  const nameCellClass =
    "sticky left-0 z-10 bg-white w-[85px] min-w-[85px] max-w-[85px] px-2 py-2 sm:py-1 text-sm sm:text-xs font-semibold whitespace-nowrap overflow-hidden";
  const sumCellClass = "min-w-[44px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-bold";

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
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 sm:px-4 sm:py-3">
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
              <th className={`${nameCellClass} bg-gray-50 !font-bold text-gray-900 text-left`}>Hole</th>
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
                    <span className="truncate text-gray-900">{p1.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">HCP {p1Handicap}</div>
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
            <tr className="border-b-2 border-gray-200 bg-[#e8f5e9]">
              <td className={`${nameCellClass} bg-[#e8f5e9] text-[10px] text-[#003d2e]`}>
                Strokes
              </td>
              {holes.map((h) => {
                const sr = getStrokesReceivedForHole(h, p1Handicap);
                return (
                  <td key={h} className={`${cellClass} text-[10px] text-[#003d2e]/70`}>
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
                    <span className="truncate text-gray-900">{p2.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">HCP {p2Handicap}</div>
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
            <tr className="border-b-2 border-gray-200 bg-[#e8f5e9]">
              <td className={`${nameCellClass} bg-[#e8f5e9] text-[10px] text-[#003d2e]`}>
                Strokes
              </td>
              {holes.map((h) => {
                const sr = getStrokesReceivedForHole(h, p2Handicap);
                return (
                  <td key={h} className={`${cellClass} text-[10px] text-[#003d2e]/70`}>
                    {sr > 0 ? sr : "0"}
                  </td>
                );
              })}
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>

            {/* Winner row */}
            <tr className="bg-green-50">
              <td className={`${nameCellClass} bg-green-50 text-[10px] text-green-700 font-semibold`}>
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
                {(() => {
                  const p1Wins = holeWinners.filter((w) => w === "p1").length;
                  const p2Wins = holeWinners.filter((w) => w === "p2").length;
                  const holesCompared = holeWinners.filter((w) => w !== null).length;
                  const holesRemaining = holes.length - holesCompared;

                  if (holesCompared === 0) {
                    return <span className="text-gray-400">-</span>;
                  }

                  if (p1Wins === p2Wins) {
                    return holesRemaining === 0
                      ? <span className="text-xs font-bold text-amber-600">Tie</span>
                      : <span className="text-xs font-bold text-amber-600">AS</span>;
                  }

                  const leaderId = p1Wins > p2Wins ? "p1" : "p2";
                  const leaderName = (leaderId === "p1" ? p1.name : p2.name).split(" ")[0];
                  const margin = Math.abs(p1Wins - p2Wins);
                  const isComplete = holesRemaining === 0 || margin > holesRemaining;

                  if (!isComplete) {
                    return <span className="text-xs font-bold text-green-700">{leaderName} {margin} UP</span>;
                  }

                  // Find clinch hole
                  let running = 0;
                  let clinchHole = -1;
                  for (let i = 0; i < holes.length; i++) {
                    const w = holeWinners[i];
                    if (w === "p1") running++;
                    else if (w === "p2") running--;
                    else if (w === null) continue;

                    const holesLeft = holes.length - (i + 1);
                    if (Math.abs(running) > holesLeft) {
                      clinchHole = i;
                      break;
                    }
                  }

                  if (clinchHole >= 0 && clinchHole < holes.length - 1) {
                    const marginAtClinch = Math.abs(running);
                    const remainingAtClinch = holes.length - (clinchHole + 1);
                    return <span className="text-xs font-bold text-green-700">{leaderName} {marginAtClinch}&amp;{remainingAtClinch}</span>;
                  }

                  return <span className="text-xs font-bold text-green-700">{leaderName} 1 UP</span>;
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Day 3 Leaderboard Tab ──────────────────────────────────────────────────

function Day3LeaderboardTab({
  round,
  day3Config,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  team1,
  team2,
  team1Name,
  team2Name,
}: {
  round: any;
  day3Config: Day3Config;
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  team1: any[];
  team2: any[];
  team1Name: string;
  team2Name: string;
}) {
  const allHoles = useMemo(() => Array.from({ length: 18 }, (_, i) => i + 1), []);

  const team1Color = team1[0]?.team?.color || "#059669";
  const team2Color = team2[0]?.team?.color || "#dc2626";

  // Calculate best ball net per hole for each team
  const holeResults = useMemo(() => {
    return allHoles.map((h) => {
      const hd = getHoleData(h);
      const par = hd?.par ?? 4;

      // Team 1: find best (lowest) net score
      let team1BestNet: number | null = null;
      for (const rp of team1) {
        const score = getPlayerScore(rp.player.id, h);
        if (score !== undefined) {
          const sr = getStrokesReceivedForHole(h, rp.player.handicap || 0);
          const net = score - sr;
          if (team1BestNet === null || net < team1BestNet) {
            team1BestNet = net;
          }
        }
      }

      // Team 2: find best (lowest) net score
      let team2BestNet: number | null = null;
      for (const rp of team2) {
        const score = getPlayerScore(rp.player.id, h);
        if (score !== undefined) {
          const sr = getStrokesReceivedForHole(h, rp.player.handicap || 0);
          const net = score - sr;
          if (team2BestNet === null || net < team2BestNet) {
            team2BestNet = net;
          }
        }
      }

      let winner: "team1" | "team2" | "tie" | null = null;
      if (team1BestNet !== null && team2BestNet !== null) {
        if (team1BestNet < team2BestNet) winner = "team1";
        else if (team2BestNet < team1BestNet) winner = "team2";
        else winner = "tie";
      }

      return {
        hole: h,
        par,
        team1BestNet,
        team2BestNet,
        winner,
      };
    });
  }, [allHoles, team1, team2, getPlayerScore, getHoleData, getStrokesReceivedForHole]);

  // Aggregate stats
  const stats = useMemo(() => {
    let team1HolesWon = 0;
    let team2HolesWon = 0;
    let holesPlayed = 0;
    let team1CumulativeNet = 0;
    let team2CumulativeNet = 0;
    let team1CumulativePar = 0;
    let team2CumulativePar = 0;
    let team1HasScores = false;
    let team2HasScores = false;

    for (const hr of holeResults) {
      if (hr.winner !== null) {
        holesPlayed++;
        if (hr.winner === "team1") team1HolesWon++;
        else if (hr.winner === "team2") team2HolesWon++;
      }
      if (hr.team1BestNet !== null) {
        team1CumulativeNet += hr.team1BestNet;
        team1CumulativePar += hr.par;
        team1HasScores = true;
      }
      if (hr.team2BestNet !== null) {
        team2CumulativeNet += hr.team2BestNet;
        team2CumulativePar += hr.par;
        team2HasScores = true;
      }
    }

    const holesRemaining = 18 - holesPlayed;
    const holeDiff = team1HolesWon - team2HolesWon;

    // Matchplay status text
    let matchplayStatus = "";
    if (holesPlayed === 0) {
      matchplayStatus = "Not started";
    } else if (holeDiff === 0) {
      matchplayStatus = "All square" + (holesRemaining > 0 ? ` with ${holesRemaining} to play` : "");
    } else {
      const leadingTeam = holeDiff > 0 ? team1Name : team2Name;
      const up = Math.abs(holeDiff);
      if (holesRemaining === 0) {
        matchplayStatus = `${leadingTeam} wins ${up} UP`;
      } else if (up > holesRemaining) {
        matchplayStatus = `${leadingTeam} wins ${up} & ${up - holesRemaining}`;
      } else {
        matchplayStatus = `${leadingTeam} ${up} UP with ${holesRemaining} to play`;
      }
    }

    // Matchplay points (6 total)
    let team1MatchPts = 0;
    let team2MatchPts = 0;
    if (holesPlayed > 0) {
      if (team1HolesWon > team2HolesWon) {
        team1MatchPts = 6;
        team2MatchPts = 0;
      } else if (team2HolesWon > team1HolesWon) {
        team1MatchPts = 0;
        team2MatchPts = 6;
      } else {
        team1MatchPts = 3;
        team2MatchPts = 3;
      }
    }

    // Score bonus (3 total)
    let team1ScorePts = 0;
    let team2ScorePts = 0;
    if (team1HasScores && team2HasScores) {
      if (team1CumulativeNet < team2CumulativeNet) {
        team1ScorePts = 3;
        team2ScorePts = 0;
      } else if (team2CumulativeNet < team1CumulativeNet) {
        team1ScorePts = 0;
        team2ScorePts = 3;
      } else {
        team1ScorePts = 1.5;
        team2ScorePts = 1.5;
      }
    }

    return {
      team1HolesWon,
      team2HolesWon,
      holesPlayed,
      holesRemaining,
      matchplayStatus,
      team1MatchPts,
      team2MatchPts,
      team1ScorePts,
      team2ScorePts,
      team1Total: team1MatchPts + team1ScorePts,
      team2Total: team2MatchPts + team2ScorePts,
      team1CumulativeNet,
      team2CumulativeNet,
      team1CumulativePar,
      team2CumulativePar,
      team1HasScores,
      team2HasScores,
    };
  }, [holeResults, team1Name, team2Name]);

  const formatNet = (net: number): string => {
    if (net === 0) return "E";
    return net > 0 ? `+${net}` : `${net}`;
  };

  return (
    <div className="space-y-6">
      {/* Matchplay Status Banner */}
      <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <h2 className="mb-2 text-xl font-bold text-gray-900">Best Ball Matchplay</h2>
        <p className="mb-4 text-lg font-semibold text-green-700">{stats.matchplayStatus}</p>

        <div className="grid grid-cols-2 gap-4">
          {/* Team 1 */}
          <div className="rounded-xl border-2 p-3" style={{ borderColor: team1Color }}>
            <div className="mb-2 flex items-center space-x-2">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: team1Color }} />
              <span className="font-bold text-gray-900">{team1Name}</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Holes won</span>
                <span className="text-gray-900 font-bold">{stats.team1HolesWon}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Best ball net</span>
                <span className="font-bold text-[#003d2e]">
                  {stats.team1HasScores ? formatNet(stats.team1CumulativeNet - stats.team1CumulativePar) : "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Team 2 */}
          <div className="rounded-xl border-2 p-3" style={{ borderColor: team2Color }}>
            <div className="mb-2 flex items-center space-x-2">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: team2Color }} />
              <span className="font-bold text-gray-900">{team2Name}</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Holes won</span>
                <span className="text-gray-900 font-bold">{stats.team2HolesWon}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Best ball net</span>
                <span className="font-bold text-[#003d2e]">
                  {stats.team2HasScores ? formatNet(stats.team2CumulativeNet - stats.team2CumulativePar) : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Points Breakdown */}
      <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Points Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-2 pr-4 text-left font-semibold text-gray-700">Category</th>
                <th className="py-2 text-center font-semibold" style={{ color: team1Color }}>
                  {team1Name}
                </th>
                <th className="py-2 text-center font-semibold" style={{ color: team2Color }}>
                  {team2Name}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 text-gray-700">Matchplay (6 pts)</td>
                <td className="py-3 text-center text-gray-900 font-bold">{stats.team1MatchPts}</td>
                <td className="py-3 text-center text-gray-900 font-bold">{stats.team2MatchPts}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 text-gray-700">Score bonus (3 pts)</td>
                <td className="py-3 text-center text-gray-900 font-bold">{stats.team1ScorePts}</td>
                <td className="py-3 text-center text-gray-900 font-bold">{stats.team2ScorePts}</td>
              </tr>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                <td className="py-3 pr-4 font-bold text-gray-900">Total</td>
                <td className="py-3 text-center text-lg font-bold text-green-600">
                  {stats.team1Total}
                </td>
                <td className="py-3 text-center text-lg font-bold text-green-600">
                  {stats.team2Total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Hole-by-hole breakdown */}
      <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Hole by Hole</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-2 pr-2 text-left font-bold text-gray-900">Hole</th>
                <th className="py-2 text-center font-semibold text-gray-700">Par</th>
                <th className="py-2 text-center font-semibold" style={{ color: team1Color }}>
                  {team1Name}
                </th>
                <th className="py-2 text-center font-semibold" style={{ color: team2Color }}>
                  {team2Name}
                </th>
                <th className="py-2 text-center font-semibold text-gray-700">Winner</th>
              </tr>
            </thead>
            <tbody>
              {holeResults.map((hr) => (
                <tr key={hr.hole} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-bold text-gray-900">{hr.hole}</td>
                  <td className="py-2 text-center text-gray-600">{hr.par}</td>
                  <td
                    className={`py-2 text-center font-semibold ${
                      hr.winner === "team1" ? "text-green-700" : "text-gray-700"
                    }`}
                  >
                    {hr.team1BestNet !== null ? hr.team1BestNet : "-"}
                  </td>
                  <td
                    className={`py-2 text-center font-semibold ${
                      hr.winner === "team2" ? "text-green-700" : "text-gray-700"
                    }`}
                  >
                    {hr.team2BestNet !== null ? hr.team2BestNet : "-"}
                  </td>
                  <td className="py-2 text-center">
                    {hr.winner === "team1" ? (
                      <div
                        className="mx-auto h-4 w-4 rounded-full"
                        style={{ backgroundColor: team1Color }}
                      />
                    ) : hr.winner === "team2" ? (
                      <div
                        className="mx-auto h-4 w-4 rounded-full"
                        style={{ backgroundColor: team2Color }}
                      />
                    ) : hr.winner === "tie" ? (
                      <span className="text-xs font-semibold text-amber-600">T</span>
                    ) : (
                      <span className="text-gray-300">&ndash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Day 3 Scorecard Tab ────────────────────────────────────────────────────

function Day3ScorecardTab({
  round,
  day3Config,
  holeDataArray,
  getHoleData,
  getPlayerScore,
  getStrokesReceivedForHole,
  canEdit,
  onCellTap,
  team1,
  team2,
  team1Name,
  team2Name,
}: {
  round: any;
  day3Config: Day3Config;
  holeDataArray: HoleInfo[];
  getHoleData: (hole: number) => HoleInfo | undefined;
  getPlayerScore: (playerId: number, hole: number) => number | undefined;
  getStrokesReceivedForHole: (hole: number, handicap: number) => number;
  canEdit: (playerId: number) => boolean;
  onCellTap: (playerId: number, holeNumber: number, playerName: string) => void;
  team1: any[];
  team2: any[];
  team1Name: string;
  team2Name: string;
}) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);

  const team1Color = team1[0]?.team?.color || "#059669";
  const team2Color = team2[0]?.team?.color || "#dc2626";

  const getScoreSymbol = (
    strokes: number,
    par: number
  ): { prefix: string; suffix: string; className: string } => {
    const diff = strokes - par;
    if (diff <= -2) return { prefix: "", suffix: "", className: "text-red-600 font-bold ring-2 ring-red-400 ring-offset-1 rounded-full" };
    if (diff === -1) return { prefix: "", suffix: "", className: "text-red-600 font-bold ring-1 ring-red-400 rounded-full" };
    if (diff === 1) return { prefix: "", suffix: "", className: "text-gray-900 font-bold ring-1 ring-gray-900 rounded-sm" };
    if (diff >= 2) return { prefix: "", suffix: "", className: "text-gray-900 font-bold ring-2 ring-gray-900 rounded-sm" };
    return { prefix: "", suffix: "", className: "text-gray-900" };
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

  // Calculate best ball net for a team on each hole
  const getBestBallForTeam = (teamPlayers: any[], holeRange: number[]) => {
    return holeRange.map((h) => {
      let bestNet: number | null = null;
      let bestPlayerIds: number[] = [];

      for (const rp of teamPlayers) {
        const score = getPlayerScore(rp.player.id, h);
        if (score !== undefined) {
          const sr = getStrokesReceivedForHole(h, rp.player.handicap || 0);
          const net = score - sr;
          if (bestNet === null || net < bestNet) {
            bestNet = net;
            bestPlayerIds = [rp.player.id];
          } else if (net === bestNet) {
            bestPlayerIds.push(rp.player.id);
          }
        }
      }

      return { hole: h, bestNet, bestPlayerIds };
    });
  };

  const team1BestBall = useMemo(() => getBestBallForTeam(team1, holes), [team1, holes, getPlayerScore, getStrokesReceivedForHole]);
  const team2BestBall = useMemo(() => getBestBallForTeam(team2, holes), [team2, holes, getPlayerScore, getStrokesReceivedForHole]);

  const cellClass = "min-w-[36px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs";
  const headerCellClass = "min-w-[36px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-semibold";
  const nameCellClass =
    "sticky left-0 z-10 bg-white min-w-[90px] max-w-[120px] px-2 py-2 sm:py-1 text-sm sm:text-xs font-semibold whitespace-nowrap truncate";
  const sumCellClass = "min-w-[40px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-bold";

  /** Render best ball row for a team */
  const renderBestBallRow = (
    teamPlayers: any[],
    bestBall: { hole: number; bestNet: number | null; bestPlayerId: number | null }[],
    teamName: string,
    teamColor: string,
  ) => {
    const frontBB = bestBall.slice(0, 9);
    const backBB = bestBall.slice(9, 18);

    const frontSum = frontBB.reduce((sum, bb) => sum + (bb.bestNet ?? 0), 0);
    const backSum = backBB.reduce((sum, bb) => sum + (bb.bestNet ?? 0), 0);
    const hasFrontScores = frontBB.some((bb) => bb.bestNet !== null);
    const hasBackScores = backBB.some((bb) => bb.bestNet !== null);
    const totalSum = frontSum + backSum;
    const hasAnyScores = hasFrontScores || hasBackScores;

    return (
      <tr className="border-b-2 border-gray-300" style={{ backgroundColor: `${teamColor}15` }}>
        <td
          className={`sticky left-0 z-10 min-w-[90px] max-w-[120px] px-2 py-1 text-xs font-bold whitespace-nowrap bg-gray-100`}
          style={{ color: teamColor }}
        >
          Best Ball
        </td>
        {frontBB.map((bb) => (
          <td key={bb.hole} className={`${cellClass} font-bold`} style={{ color: teamColor }}>
            {bb.bestNet !== null ? bb.bestNet : "-"}
          </td>
        ))}
        <td className={`${sumCellClass} bg-green-50`} style={{ color: teamColor }}>
          {hasFrontScores ? frontSum : "-"}
        </td>
        {backBB.map((bb) => (
          <td key={bb.hole} className={`${cellClass} font-bold`} style={{ color: teamColor }}>
            {bb.bestNet !== null ? bb.bestNet : "-"}
          </td>
        ))}
        <td className={`${sumCellClass} bg-blue-50`} style={{ color: teamColor }}>
          {hasBackScores ? backSum : "-"}
        </td>
        <td className={`${sumCellClass} bg-gray-100`} style={{ color: teamColor }}>
          {hasAnyScores ? totalSum : "-"}
        </td>
      </tr>
    );
  };

  return (
    <div className="rounded-2xl bg-white shadow-lg overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-max border-collapse">
          <thead className="sticky top-0 z-20">
            {/* Hole number row */}
            <tr className="border-b border-gray-300 bg-gray-50">
              <th className={`${nameCellClass} bg-gray-50 !font-bold text-gray-900 text-left`}>Hole</th>
              {frontNine.map((h) => (
                <th key={h} className={`${headerCellClass} bg-gray-50 text-gray-700`}>{h}</th>
              ))}
              <th className={`${headerCellClass} bg-green-50 text-green-800`}>OUT</th>
              {backNine.map((h) => (
                <th key={h} className={`${headerCellClass} bg-gray-50 text-gray-700`}>{h}</th>
              ))}
              <th className={`${headerCellClass} bg-blue-50 text-blue-800`}>IN</th>
              <th className={`${headerCellClass} bg-gray-100 text-gray-900`}>TOT</th>
            </tr>
            {/* Par row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-600`}>Par</td>
              {frontNine.map((h) => {
                const hd = getHoleData(h);
                return <td key={h} className={`${cellClass} bg-gray-50 text-gray-600`}>{hd?.par ?? "-"}</td>;
              })}
              <td className={`${sumCellClass} bg-green-50 text-green-800`}>
                {holeDataArray.length > 0 ? frontNine.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0) : "-"}
              </td>
              {backNine.map((h) => {
                const hd = getHoleData(h);
                return <td key={h} className={`${cellClass} bg-gray-50 text-gray-600`}>{hd?.par ?? "-"}</td>;
              })}
              <td className={`${sumCellClass} bg-blue-50 text-blue-800`}>
                {holeDataArray.length > 0 ? backNine.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0) : "-"}
              </td>
              <td className={`${sumCellClass} bg-gray-100 text-gray-900`}>
                {holeDataArray.length > 0 ? holes.reduce((sum, h) => sum + (getHoleData(h)?.par ?? 0), 0) : "-"}
              </td>
            </tr>

            {/* SI row */}
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <td className={`${nameCellClass} bg-gray-50 text-gray-500`}>SI</td>
              {frontNine.map((h) => {
                const hd = getHoleData(h);
                return <td key={h} className={`${cellClass} bg-gray-50 text-gray-500`}>{hd?.strokeIndex ?? "-"}</td>;
              })}
              <td className={`${sumCellClass} bg-green-50`} />
              {backNine.map((h) => {
                const hd = getHoleData(h);
                return <td key={h} className={`${cellClass} bg-gray-50 text-gray-500`}>{hd?.strokeIndex ?? "-"}</td>;
              })}
              <td className={`${sumCellClass} bg-blue-50`} />
              <td className={`${sumCellClass} bg-gray-100`} />
            </tr>
          </thead>
          <tbody>
            {/* ── Team 1 Section ── */}
            {/* Team 1 header */}
            <tr style={{ backgroundColor: `${team1Color}10` }}>
              <td
                className="sticky left-0 z-10 px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-gray-50"
                style={{ color: team1Color }}
              >
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team1Color }} />
                  <span>{team1Name}</span>
                </div>
              </td>
              <td colSpan={21} style={{ backgroundColor: `${team1Color}10` }} />
            </tr>

            {/* Team 1 player rows */}
            {team1.map((rp: any) => {
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
                  highlightHoles={team1BestBall
                    .filter((bb) => bb.bestPlayerIds.includes(player.id))
                    .map((bb) => bb.hole)}
                  highlightColor={team1Color}
                />
              );
            })}

            {/* Team 1 Best Ball row */}
            {renderBestBallRow(team1, team1BestBall, team1Name, team1Color)}

            {/* Separator */}
            <tr>
              <td colSpan={22} className="h-3 bg-gray-300 sm:h-2 sm:bg-gray-200" />
            </tr>

            {/* ── Team 2 Section ── */}
            {/* Team 2 header */}
            <tr style={{ backgroundColor: `${team2Color}10` }}>
              <td
                className="sticky left-0 z-10 px-2 py-1.5 text-xs font-bold whitespace-nowrap bg-gray-50"
                style={{ color: team2Color }}
              >
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team2Color }} />
                  <span>{team2Name}</span>
                </div>
              </td>
              <td colSpan={21} style={{ backgroundColor: `${team2Color}10` }} />
            </tr>

            {/* Team 2 player rows */}
            {team2.map((rp: any) => {
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
                  highlightHoles={team2BestBall
                    .filter((bb) => bb.bestPlayerIds.includes(player.id))
                    .map((bb) => bb.hole)}
                  highlightColor={team2Color}
                />
              );
            })}

            {/* Team 2 Best Ball row */}
            {renderBestBallRow(team2, team2BestBall, team2Name, team2Color)}

            {/* Winner row */}
            <tr className="bg-green-50">
              <td className={`sticky left-0 z-10 bg-green-50 min-w-[90px] max-w-[120px] px-2 py-1 text-[10px] text-green-700 font-semibold whitespace-nowrap`}>
                Winner
              </td>
              {frontNine.map((h) => {
                const idx = h - 1;
                const t1Net = team1BestBall[idx]?.bestNet ?? null;
                const t2Net = team2BestBall[idx]?.bestNet ?? null;
                let content: React.ReactNode = <span className="text-gray-300">&ndash;</span>;
                let cellBg = "";

                if (t1Net !== null && t2Net !== null) {
                  if (t1Net < t2Net) {
                    content = <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: team1Color }} />;
                    cellBg = "bg-green-100/50";
                  } else if (t2Net < t1Net) {
                    content = <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: team2Color }} />;
                    cellBg = "bg-green-100/50";
                  } else {
                    content = <span className="text-xs font-semibold text-amber-600">T</span>;
                  }
                }

                return <td key={h} className={`${cellClass} ${cellBg}`}>{content}</td>;
              })}
              <td className={`${sumCellClass} bg-green-50`} />
              {backNine.map((h) => {
                const idx = h - 1;
                const t1Net = team1BestBall[idx]?.bestNet ?? null;
                const t2Net = team2BestBall[idx]?.bestNet ?? null;
                let content: React.ReactNode = <span className="text-gray-300">&ndash;</span>;
                let cellBg = "";

                if (t1Net !== null && t2Net !== null) {
                  if (t1Net < t2Net) {
                    content = <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: team1Color }} />;
                    cellBg = "bg-green-100/50";
                  } else if (t2Net < t1Net) {
                    content = <div className="h-4 w-4 rounded-full mx-auto" style={{ backgroundColor: team2Color }} />;
                    cellBg = "bg-green-100/50";
                  } else {
                    content = <span className="text-xs font-semibold text-amber-600">T</span>;
                  }
                }

                return <td key={h} className={`${cellClass} ${cellBg}`}>{content}</td>;
              })}
              <td className={`${sumCellClass} bg-blue-50`} />
              <td className={`${sumCellClass} bg-gray-100`} />
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
          teamColor: (rp as any).team?.color || "",
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
                    <span className="flex items-center gap-1.5">
                      {s.teamColor && <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.teamColor }} />}
                      <span>{s.playerName}</span>
                    </span>
                  </td>
                  <td className="py-3 text-center text-gray-600">{s.handicap}</td>
                  <td className="py-3 text-center text-gray-600">
                    {s.lastHole > 0 ? s.lastHole : "-"}
                  </td>
                  <td className="py-3 text-center font-semibold text-gray-900">
                    {s.holesPlayed > 0 ? (s.gross === 0 ? "E" : s.gross > 0 ? `+${s.gross}` : s.gross) : "-"}
                  </td>
                  <td className="py-3 text-center font-semibold text-[#003d2e]">
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
  const cellClass = "min-w-[36px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs";
  const headerCellClass = "min-w-[36px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-semibold";
  const nameCellClass =
    "sticky left-0 z-10 bg-white min-w-[90px] max-w-[120px] px-2 py-2 sm:py-1 text-sm sm:text-xs font-semibold whitespace-nowrap truncate";
  const sumCellClass = "min-w-[40px] px-1 py-2 sm:py-1 text-center text-sm sm:text-xs font-bold";

  return (
    <div className="rounded-2xl bg-white shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-max border-collapse">
          <thead>
            {/* Hole number row */}
            <tr className="border-b border-gray-300 bg-gray-50">
              <th className={`${nameCellClass} bg-gray-50 !font-bold text-gray-900 text-left`}>Hole</th>
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
  highlightHoles,
  highlightColor,
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
  highlightHoles?: number[];
  highlightColor?: string;
}) {
  const isHighlighted = (h: number) => highlightHoles?.includes(h) ?? false;

  return (
    <>
      {/* Score row */}
      <tr className="border-b border-gray-100">
        <td className={`${nameCellClass} truncate`}>
          <div className="leading-tight">
            <div className="truncate text-gray-900 font-semibold">{player.name}</div>
            <div className="text-[10px] text-gray-400">HCP {handicap}</div>
          </div>
        </td>
        {frontNine.map((h) => {
          const score = getPlayerScore(player.id, h);
          const hd = getHoleData(h);
          const par = hd?.par ?? 4;
          const sym = score !== undefined ? getScoreSymbol(score, par) : null;
          const highlighted = isHighlighted(h);

          return (
            <td
              key={h}
              className={`${cellClass} cursor-pointer hover:bg-green-50`}
              style={highlighted && highlightColor ? { backgroundColor: `${highlightColor}20` } : undefined}
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
          const highlighted = isHighlighted(h);

          return (
            <td
              key={h}
              className={`${cellClass} cursor-pointer hover:bg-green-50`}
              style={highlighted && highlightColor ? { backgroundColor: `${highlightColor}20` } : undefined}
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
      <tr className="border-b-2 border-gray-200 bg-[#e8f5e9]">
        <td className={`${nameCellClass} bg-[#e8f5e9] text-[10px] text-[#003d2e]`}>
          Strokes
        </td>
        {frontNine.map((h) => {
          const sr = getStrokesReceivedForHole(h, handicap);
          return (
            <td key={h} className={`${cellClass} text-[10px] text-[#003d2e]/70`}>
              {sr > 0 ? sr : "0"}
            </td>
          );
        })}
        <td className={`${sumCellClass} bg-green-50`} />
        {backNine.map((h) => {
          const sr = getStrokesReceivedForHole(h, handicap);
          return (
            <td key={h} className={`${cellClass} text-[10px] text-[#003d2e]/70`}>
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
  holePar,
  currentScore,
  isPending,
  onSelect,
  onClose,
}: {
  playerName: string;
  holeNumber: number;
  holePar?: number;
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
          <p className="text-sm text-gray-600">
            Hole {holeNumber}{holePar !== undefined && ` — Par ${holePar}`}
          </p>
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
              className={`rounded-xl py-4 sm:py-3 text-lg font-bold transition-all ${
                currentScore === s
                  ? "bg-[#003d2e] text-[#fff8e7]"
                  : "bg-gray-100 text-gray-900 hover:bg-[#e8f5e9] active:bg-[#e8f5e9]/70"
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
