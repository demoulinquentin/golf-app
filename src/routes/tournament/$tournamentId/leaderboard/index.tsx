import { createFileRoute, Link } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users, Target, Calendar, Info, Copy, Check, KeyRound } from "lucide-react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import toast from "react-hot-toast";
import React, { useState } from "react";

const searchSchema = z.object({
  preview: z.boolean().optional(),
});

export const Route = createFileRoute("/tournament/$tournamentId/leaderboard/")({
  component: TournamentLeaderboardPage,
  validateSearch: zodValidator(searchSchema),
});

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "–";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function TournamentLeaderboardPage() {
  const { tournamentId } = Route.useParams();
  const { preview } = Route.useSearch();
  const trpc = useTRPC();
  const { getTournamentAccess, isAdminFor } = useTournamentAccessStore();
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);

  const tournamentAccess = getTournamentAccess(parseInt(tournamentId));
  const isAdmin = isAdminFor(parseInt(tournamentId));

  const leaderboardQuery = useQuery(
    trpc.getTournamentLeaderboard.queryOptions(
      { tournamentId: parseInt(tournamentId) },
      { refetchInterval: 10000 }
    )
  );

  const tournamentQuery = useQuery(
    trpc.getTournament.queryOptions({ tournamentId: parseInt(tournamentId) })
  );

  if (leaderboardQuery.isLoading || tournamentQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#003d2e] border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700">Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (!leaderboardQuery.data || !tournamentQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">Tournament not found</p>
          <Link to="/" className="mt-4 text-[#003d2e] hover:text-[#00261c]">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, rounds, individualLeaderboard, teamLeaderboard } = leaderboardQuery.data;
  const tournamentData = tournamentQuery.data;

  const handleCopyJoinCode = async () => {
    if (tournamentData.joinCode) {
      await navigator.clipboard.writeText(tournamentData.joinCode);
      setCopiedJoinCode(true);
      setTimeout(() => setCopiedJoinCode(false), 2000);
      toast.success("Join code copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen bg-[#fff8e7]">
      {/* Header */}
      <div className="border-b border-[#003d2e]/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="py-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#003d2e] text-[#ffd700]">
              <Trophy className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">{tournament.name}</h1>
            <div className="mt-2 flex items-center justify-center space-x-4 text-sm text-gray-600">
              <span className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>{tournamentData.rounds.length} Rounds</span>
              </span>
              <span>•</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  tournament.status === "completed"
                    ? "bg-blue-100 text-blue-700"
                    : tournament.status === "in_progress"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {tournament.status === "completed"
                  ? "Completed"
                  : tournament.status === "in_progress"
                  ? "In Progress"
                  : "Not Started"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {preview && (
          <div className="mb-6 rounded-2xl bg-blue-600 p-4 text-white shadow-xl">
            <div className="flex items-center justify-center space-x-2">
              <Info className="h-5 w-5" />
              <p className="font-semibold">Preview Mode - Tournament data is simulated</p>
            </div>
          </div>
        )}

        {/* Join Code Section - Show for admins */}
        {isAdmin && tournamentData.joinCode && (
          <div className="mb-6 rounded-2xl bg-[#003d2e] p-6 text-[#fff8e7] shadow-xl">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <KeyRound className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Tournament Join Code</h3>
                </div>
                <p className="text-sm text-[#fff8e7]/80">
                  Share this code with players so they can join the tournament
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-white/20 px-6 py-3 backdrop-blur-sm">
                  <code className="text-2xl font-bold tracking-wider text-[#ffd700]">
                    {tournamentData.joinCode}
                  </code>
                </div>
                <button
                  onClick={handleCopyJoinCode}
                  className="rounded-lg bg-white/20 p-3 backdrop-blur-sm hover:bg-white/30"
                  title="Copy join code"
                >
                  {copiedJoinCode ? (
                    <Check className="h-5 w-5 text-[#fff8e7]" />
                  ) : (
                    <Copy className="h-5 w-5 text-[#fff8e7]" />
                  )}
                </button>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-sm text-[#fff8e7]/90">
                Players can join at: <span className="font-mono font-semibold">{typeof window !== "undefined" ? `${window.location.origin}/tournament/join` : ""}</span>
              </p>
            </div>
          </div>
        )}

        {/* Player Identity Badge */}
        {tournamentAccess && (
          <div className="mb-6 rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f5e9] text-[#003d2e]">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Playing as</p>
                  <p className="font-semibold text-gray-900">
                    {tournamentAccess.playerName}
                    {isAdmin && <span className="ml-2 text-xs text-[#003d2e]">(Admin)</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* Team Leaderboard */}
          {teamLeaderboard.length > 0 && (
            <div className="rounded-2xl bg-white p-4 sm:p-8 shadow-xl">
              <div className="mb-6 flex items-center space-x-3">
                <Trophy className="h-6 w-6 text-[#ffd700]" />
                <h2 className="text-2xl font-bold text-gray-900">Team Standings</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-xs text-gray-500">
                      <th className="px-1 py-2 sm:py-3 text-left font-medium sticky left-0 z-10 bg-white">#</th>
                      <th className="px-1 py-2 sm:py-3 text-left font-medium sticky left-7 z-10 bg-white">Team</th>
                      {rounds.map((r: any) => (
                        <th key={r.roundId} className="px-1 py-2 sm:py-3 text-center font-medium">{r.roundName}</th>
                      ))}
                      <th className="px-1 py-2 sm:py-3 text-center font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamLeaderboard.map((entry) => (
                      <tr key={entry.team.id} className="hover:bg-gray-50">
                        <td className="px-1 py-2 sm:py-3 sticky left-0 z-10 bg-white">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: entry.team.color }}
                          >
                            {entry.position}
                          </span>
                        </td>
                        <td className="px-1 py-2 sm:py-3 font-semibold text-gray-900 sticky left-7 z-10 bg-white">{entry.team.name}</td>
                        {rounds.map((r: any) => {
                          const rp = entry.roundPoints?.find((p: any) => p.roundId === r.roundId);
                          return (
                            <td key={r.roundId} className="px-1 py-2 sm:py-3 text-center font-medium text-[#003d2e]">
                              {rp?.points || "–"}
                            </td>
                          );
                        })}
                        <td className="px-1 py-2 sm:py-3 text-center font-bold text-[#003d2e]">{entry.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Individual Leaderboard */}
          <div className="rounded-2xl bg-white p-4 sm:p-8 shadow-xl">
            <div className="mb-6 flex items-center space-x-3">
              <Users className="h-6 w-6 text-[#003d2e]" />
              <h2 className="text-2xl font-bold text-gray-900">Individual Standings</h2>
            </div>

            {individualLeaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-xs text-gray-500">
                      <th className="px-1 py-2 sm:py-3 text-left font-medium sticky left-0 z-10 bg-white">#</th>
                      <th className="px-1 py-2 sm:py-3 text-left font-medium sticky left-7 z-10 bg-white">Player</th>
                      <th className="px-1 py-2 sm:py-3 text-left font-medium">Team</th>
                      <th className="px-1 py-2 sm:py-3 text-center font-medium">HCP</th>
                      {rounds.map((r: any) => (
                        <th key={r.roundId} className="px-1 py-2 sm:py-3 text-center font-medium" colSpan={3}>
                          {r.roundName}
                        </th>
                      ))}
                      <th className="px-1 py-2 sm:py-3 text-center font-medium" colSpan={3}>Total</th>
                    </tr>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="sticky left-0 z-10 bg-white"></th>
                      <th className="sticky left-7 z-10 bg-white"></th>
                      <th></th>
                      <th></th>
                      {rounds.map((r: any) => (
                        <React.Fragment key={r.roundId}>
                          <th className="px-1 py-1 text-center"><span className="sm:hidden">G</span><span className="hidden sm:inline">Gross</span></th>
                          <th className="px-1 py-1 text-center"><span className="sm:hidden">N</span><span className="hidden sm:inline">Net</span></th>
                          <th className="px-1 py-1 text-center">{r.isDay3 ? "BB" : (<><span className="sm:hidden">P</span><span className="hidden sm:inline">Pts</span></>)}</th>
                        </React.Fragment>
                      ))}
                      <th className="px-1 py-1 text-center"><span className="sm:hidden">G</span><span className="hidden sm:inline">Gross</span></th>
                      <th className="px-1 py-1 text-center"><span className="sm:hidden">N</span><span className="hidden sm:inline">Net</span></th>
                      <th className="px-1 py-1 text-center"><span className="sm:hidden">P</span><span className="hidden sm:inline">Pts</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {individualLeaderboard.map((entry) => (
                      <tr key={entry.player.id} className="hover:bg-gray-50">
                        <td className="px-1 py-2 sm:py-3 sticky left-0 z-10 bg-white">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                              entry.position === 1
                                ? "bg-yellow-400 text-yellow-900"
                                : entry.position === 2
                                ? "bg-gray-300 text-gray-900"
                                : entry.position === 3
                                ? "bg-orange-300 text-orange-900"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {entry.position}
                          </span>
                        </td>
                        <td className="px-1 py-2 sm:py-3 font-medium text-gray-900 sticky left-7 z-10 bg-white">{entry.player.name}</td>
                        <td className="px-1 py-2 sm:py-3">
                          {entry.teamColor && (
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: entry.teamColor }} />
                              <span className="text-gray-600">{entry.teamName}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-2 sm:py-3 text-center text-gray-600">{entry.player.handicap}</td>
                        {rounds.map((r: any) => {
                          const rs = entry.roundScores?.find((s: any) => s.roundId === r.roundId);
                          return (
                            <React.Fragment key={r.roundId}>
                              <td className="px-1 py-2 sm:py-3 text-center text-gray-700">{formatScore(rs?.grossScore)}</td>
                              <td className="px-1 py-2 sm:py-3 text-center text-gray-700">{formatScore(rs?.netScore)}</td>
                              <td className="px-1 py-2 sm:py-3 text-center font-medium text-[#003d2e]">
                                {rs?.isDay3 ? (rs?.bbCount ?? "–") : (rs?.points || "–")}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-1 py-2 sm:py-3 text-center font-semibold text-gray-900">{formatScore(entry.totalGrossScore)}</td>
                        <td className="px-1 py-2 sm:py-3 text-center font-semibold text-gray-900">{formatScore(entry.totalNetScore)}</td>
                        <td className="px-1 py-2 sm:py-3 text-center font-bold text-[#003d2e]">{entry.totalPoints || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-600">
                <Users className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p>No players yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Rounds */}
        <div className="mt-8 rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 flex items-center space-x-3">
            <Target className="h-6 w-6 text-[#003d2e]" />
            <h2 className="text-2xl font-bold text-gray-900">Rounds</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournamentData.rounds.map((round, index) => (
              <Link
                key={round.id}
                to="/round/$roundId"
                params={{ roundId: String(round.id) }}
                className="group rounded-xl border-2 border-gray-200 bg-white p-6 transition-all hover:border-[#003d2e] hover:shadow-lg"
              >
                <div className="mb-3">
                  <p className="text-sm font-medium text-[#003d2e]">Round {index + 1}</p>
                  <h3 className="font-bold text-gray-900 group-hover:text-[#003d2e]">
                    {round.name}
                  </h3>
                  <p className="text-sm text-gray-600">{round.courseName}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      round.status === "completed"
                        ? "bg-blue-100 text-blue-700"
                        : round.status === "in_progress"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {round.status === "completed"
                      ? "Completed"
                      : round.status === "in_progress"
                      ? "In Progress"
                      : "Not Started"}
                  </span>
                  <span className="text-gray-600">{round.players.length} players</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
