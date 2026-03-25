import { createFileRoute, Link } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users, Target, Calendar, Info, Copy, Check, KeyRound } from "lucide-react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import toast from "react-hot-toast";
import { useState } from "react";

const searchSchema = z.object({
  preview: z.boolean().optional(),
});

export const Route = createFileRoute("/tournament/$tournamentId/leaderboard/")({
  component: TournamentLeaderboardPage,
  validateSearch: zodValidator(searchSchema),
});

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
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700">Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (!leaderboardQuery.data || !tournamentQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">Tournament not found</p>
          <Link to="/" className="mt-4 text-purple-600 hover:text-purple-700">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, individualLeaderboard, teamLeaderboard } = leaderboardQuery.data;
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      {/* Header */}
      <div className="border-b border-purple-200/50 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="py-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white">
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
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white shadow-xl">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <KeyRound className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Tournament Join Code</h3>
                </div>
                <p className="text-sm text-purple-100">
                  Share this code with players so they can join the tournament
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-white/20 px-6 py-3 backdrop-blur-sm">
                  <code className="text-2xl font-bold tracking-wider text-white">
                    {tournamentData.joinCode}
                  </code>
                </div>
                <button
                  onClick={handleCopyJoinCode}
                  className="rounded-lg bg-white/20 p-3 backdrop-blur-sm hover:bg-white/30"
                  title="Copy join code"
                >
                  {copiedJoinCode ? (
                    <Check className="h-5 w-5 text-white" />
                  ) : (
                    <Copy className="h-5 w-5 text-white" />
                  )}
                </button>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-sm text-purple-50">
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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Playing as</p>
                  <p className="font-semibold text-gray-900">
                    {tournamentAccess.playerName}
                    {isAdmin && <span className="ml-2 text-xs text-purple-600">(Admin)</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Individual Leaderboard */}
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center space-x-3">
              <Users className="h-6 w-6 text-purple-600" />
              <h2 className="text-2xl font-bold text-gray-900">Individual Standings</h2>
            </div>

            {individualLeaderboard.length > 0 ? (
              <div className="space-y-3">
                {individualLeaderboard.map((entry) => (
                  <div key={entry.player.id} className="rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-purple-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                            entry.position === 1
                              ? "bg-yellow-400 text-yellow-900"
                              : entry.position === 2
                              ? "bg-gray-400 text-gray-900"
                              : entry.position === 3
                              ? "bg-orange-400 text-orange-900"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {entry.position}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{entry.player.name}</p>
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <span>HCP: {entry.player.handicap}</span>
                            {entry.teamName && (
                              <>
                                <span>•</span>
                                <span className="text-purple-600">{entry.teamName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">
                          {entry.totalPoints} <span className="text-sm font-normal text-gray-500">pts</span>
                        </p>
                        <p className="text-xs text-gray-600">Gross: {entry.totalGrossScore}</p>
                      </div>
                    </div>

                    {/* Per-round breakdown */}
                    {entry.roundScores && entry.roundScores.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500">
                              <th className="px-3 py-2 text-left font-medium">Day</th>
                              <th className="px-3 py-2 text-right font-medium">Gross</th>
                              <th className="px-3 py-2 text-right font-medium">Net</th>
                              <th className="px-3 py-2 text-right font-medium">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entry.roundScores.map((rs: any) => (
                              <tr key={rs.roundId}>
                                <td className="px-3 py-2 text-gray-700">{rs.roundName}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">{rs.grossScore ?? "–"}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">{rs.netScore ?? "–"}</td>
                                <td className="px-3 py-2 text-right font-medium text-purple-600">{rs.points || "–"}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-semibold">
                              <td className="px-3 py-2 text-gray-900">Total</td>
                              <td className="px-3 py-2 text-right text-gray-900">{entry.totalGrossScore || "–"}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{entry.totalNetScore || "–"}</td>
                              <td className="px-3 py-2 text-right text-purple-600">{entry.totalPoints || "–"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-gray-600">
                <Users className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p>No scores yet</p>
              </div>
            )}
          </div>

          {/* Team Leaderboard */}
          {teamLeaderboard.length > 0 && (
            <div className="rounded-2xl bg-white p-8 shadow-xl">
              <div className="mb-6 flex items-center space-x-3">
                <Trophy className="h-6 w-6 text-purple-600" />
                <h2 className="text-2xl font-bold text-gray-900">Team Standings</h2>
              </div>

              <div className="space-y-3">
                {teamLeaderboard.map((entry) => (
                  <div key={entry.team.id} className="rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-purple-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                          style={{ backgroundColor: entry.team.color }}
                        >
                          {entry.position}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{entry.team.name}</p>
                          <p className="text-sm text-gray-600">{entry.playerCount} players</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">
                          {entry.totalPoints} <span className="text-sm font-normal text-gray-500">pts</span>
                        </p>
                      </div>
                    </div>

                    {/* Points per round */}
                    {entry.roundPoints && entry.roundPoints.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500">
                              <th className="px-3 py-2 text-left font-medium">Day</th>
                              <th className="px-3 py-2 text-right font-medium">Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entry.roundPoints.map((rp: any) => (
                              <tr key={rp.roundId}>
                                <td className="px-3 py-2 text-gray-700">{rp.roundName}</td>
                                <td className="px-3 py-2 text-right font-medium text-purple-600">{rp.points}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-semibold">
                              <td className="px-3 py-2 text-gray-900">Total</td>
                              <td className="px-3 py-2 text-right text-purple-600">{entry.totalPoints}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rounds */}
        <div className="mt-8 rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 flex items-center space-x-3">
            <Target className="h-6 w-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900">Rounds</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournamentData.rounds.map((round, index) => (
              <Link
                key={round.id}
                to="/round/$roundId"
                params={{ roundId: String(round.id) }}
                className="group rounded-xl border-2 border-gray-200 bg-white p-6 transition-all hover:border-purple-600 hover:shadow-lg"
              >
                <div className="mb-3">
                  <p className="text-sm font-medium text-purple-600">Round {index + 1}</p>
                  <h3 className="font-bold text-gray-900 group-hover:text-purple-600">
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
