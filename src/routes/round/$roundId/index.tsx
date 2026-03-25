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

type TabId = "leaderboard" | "party1" | "party2";

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
    if (activeTab !== "leaderboard" || preview) return;
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "leaderboard", label: "Leaderboard" },
    { id: "party1", label: team1Name },
    { id: "party2", label: team2Name },
  ];

  return (
    <div className="mx-auto max-w-7xl px-2 py-4 sm:px-4 lg:px-8">
      {preview && (
        <div className="mb-4 rounded-xl bg-blue-600 p-3 text-center text-white shadow-lg">
          <p className="font-semibold">Preview Mode - Scores will not be saved</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="mb-4 flex space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-green-600 text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "leaderboard" && (
        <LeaderboardTab
          round={round}
          holeDataArray={holeDataArray}
          getHoleData={getHoleData}
          getPlayerScore={getPlayerScore}
          getStrokesReceivedForHole={getStrokesReceivedForHole}
        />
      )}
      {activeTab === "party1" && (
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
      {activeTab === "party2" && (
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

        let gross = 0;
        let net = 0;
        let lastHole = 0;
        let holesPlayed = 0;

        for (let h = 1; h <= 18; h++) {
          const score = getPlayerScore(player.id, h);
          if (score !== undefined) {
            gross += score;
            const strokes = getStrokesReceivedForHole(h, handicap);
            net += Math.max(0, score - strokes);
            if (h > lastHole) lastHole = h;
            holesPlayed++;
          }
        }

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
  const standingsWithPoints = useMemo(() => {
    const pointsMap = [6, 5, 4, 3, 2, 1];
    let rank = 0;
    let prevNet = -1;
    let skipCount = 0;

    return individualStandings.map((s: any, idx: number) => {
      if (s.holesPlayed === 0) {
        return { ...s, rank: "-", pts: 0 };
      }
      if (s.net !== prevNet) {
        rank = idx + 1;
        skipCount = 0;
        prevNet = s.net;
      } else {
        skipCount++;
      }
      const pts = rank <= pointsMap.length ? pointsMap[rank - 1] : 0;
      return { ...s, rank, pts };
    });
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
                <th className="py-2 text-center font-semibold text-gray-700">Last</th>
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
                    {s.holesPlayed > 0 ? s.gross : "-"}
                  </td>
                  <td className="py-3 text-center font-semibold text-purple-600">
                    {s.holesPlayed > 0 ? s.net : "-"}
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
