import { createFileRoute } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

export const Route = createFileRoute("/round/$roundId/leaderboard/")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { roundId } = Route.useParams();
  const trpc = useTRPC();

  const leaderboardQuery = useQuery(
    trpc.getLeaderboard.queryOptions(
      { roundId: parseInt(roundId) },
      { refetchInterval: 3000 } // Poll every 3 seconds
    )
  );

  // Helper to format score relative to par
  const formatRelativeToPar = (totalStrokes: number, holesPlayed: number, coursePar: number = 72) => {
    if (holesPlayed === 0) return "-";
    
    // Calculate par for holes played (assuming par 4 average)
    const parForHolesPlayed = Math.round((coursePar / 18) * holesPlayed);
    const relativeToPar = totalStrokes - parForHolesPlayed;
    
    if (relativeToPar === 0) return "E"; // Even par
    if (relativeToPar > 0) return `+${relativeToPar}`;
    return `${relativeToPar}`; // Negative already has minus sign
  };

  if (!leaderboardQuery.data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#003d2e] border-t-transparent"></div>
      </div>
    );
  }

  const { round, leaderboard } = leaderboardQuery.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Stats */}
      <div className="mb-8 grid gap-6 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Players</p>
              <p className="text-2xl font-bold text-gray-900">{leaderboard.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Current Hole</p>
              <p className="text-2xl font-bold text-gray-900">{round.currentHole}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
              <Minus className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Status</p>
              <p className="text-2xl font-bold text-gray-900 capitalize">{round.status}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="bg-[#003d2e] px-8 py-6">
          <h2 className="text-3xl font-bold text-[#fff8e7]">Live Leaderboard</h2>
          <p className="text-[#fff8e7]/90">Real-time standings</p>
        </div>

        <div className="divide-y divide-gray-100">
          {leaderboard.map((player, index) => {
            const position = index + 1;
            const isLeader = position === 1;
            const strokesBehind = isLeader ? 0 : player.totalStrokes - leaderboard[0].totalStrokes;

            return (
              <div
                key={player.playerId}
                className={`px-8 py-6 transition-all hover:bg-gray-50 ${
                  isLeader ? "bg-[#e8f5e9]" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    {/* Position */}
                    <div className="flex items-center justify-center w-16">
                      {isLeader ? (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-lg">
                          <Trophy className="h-6 w-6" />
                        </div>
                      ) : (
                        <span className="text-3xl font-bold text-gray-400">{position}</span>
                      )}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {player.teamColor && (
                          <div
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: player.teamColor }}
                          />
                        )}
                        <h3 className="text-xl font-bold text-gray-900">
                          {player.playerName}
                          {player.teamName && (
                            <span className="ml-2 text-base font-normal text-gray-600">
                              ({player.teamName})
                            </span>
                          )}
                        </h3>
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600">
                        <span>Handicap: {player.handicap}</span>
                        <span>•</span>
                        <span>{player.holesPlayed} holes</span>
                        {player.lastHole > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-semibold">Last: Hole {player.lastHole}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Score Info */}
                  <div className="text-right">
                    <div className="flex items-center justify-end space-x-6">
                      {/* Relative to Par */}
                      <div>
                        <p className="text-4xl font-bold text-[#003d2e]">
                          {formatRelativeToPar(player.totalStrokes, player.holesPlayed)}
                        </p>
                        <p className="text-xs text-gray-600">To Par</p>
                      </div>
                      
                      {/* Gross Score */}
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-gray-700">
                          {player.totalStrokes > 0 ? player.totalStrokes : "-"}
                        </p>
                        <p className="text-xs text-gray-600">Gross</p>
                      </div>
                      
                      {/* Net Score (if handicap > 0) */}
                      {player.handicap > 0 && player.totalStrokes > 0 && (
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-[#003d2e]">
                            {Math.round(player.totalStrokes - player.handicap)}
                          </p>
                          <p className="text-xs text-gray-600">Net</p>
                        </div>
                      )}
                    </div>
                    
                    {!isLeader && strokesBehind > 0 && (
                      <p className="mt-2 text-sm font-medium text-gray-500">
                        {strokesBehind} {strokesBehind === 1 ? "stroke" : "strokes"} behind
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {leaderboard.length === 0 && (
          <div className="px-8 py-12 text-center">
            <p className="text-gray-600">No scores recorded yet. Start scoring to see the leaderboard!</p>
          </div>
        )}
      </div>

      {/* Team Leaderboard */}
      {leaderboardQuery.data.teamLeaderboard && leaderboardQuery.data.teamLeaderboard.length > 0 && (
        <div className="mt-8 rounded-2xl bg-white shadow-xl overflow-hidden">
          <div className="bg-[#003d2e] px-8 py-6">
            <h2 className="text-3xl font-bold text-[#fff8e7]">Team Standings</h2>
            <p className="text-[#fff8e7]/90">Combined team scores</p>
          </div>

          <div className="divide-y divide-gray-100">
            {leaderboardQuery.data.teamLeaderboard.map((team) => {
              const isLeading = team.position === 1;

              return (
                <div
                  key={team.teamId}
                  className={`px-8 py-6 transition-all hover:bg-gray-50 ${
                    isLeading ? "bg-[#e8f5e9]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                      {/* Position */}
                      <div className="flex items-center justify-center w-16">
                        {isLeading ? (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-lg">
                            <Trophy className="h-6 w-6" />
                          </div>
                        ) : (
                          <span className="text-3xl font-bold text-gray-400">{team.position}</span>
                        )}
                      </div>

                      {/* Team Info */}
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div
                            className="h-5 w-5 rounded-full"
                            style={{ backgroundColor: team.teamColor }}
                          />
                          <h3 className="text-xl font-bold text-gray-900">{team.teamName}</h3>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {team.playerCount} {team.playerCount === 1 ? "player" : "players"}
                        </p>
                      </div>
                    </div>

                    {/* Score Info */}
                    <div className="text-right">
                      <p className="text-4xl font-bold text-[#003d2e]">
                        {team.totalStrokes}
                      </p>
                      <p className="text-sm text-gray-600">Total Strokes</p>
                    </div>
                  </div>

                  {/* Team Players with Contributions */}
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-gray-700">Player Contributions:</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {team.players.map((player) => (
                        <div
                          key={player.playerId}
                          className="rounded-lg bg-gray-50 p-3 flex items-center justify-between"
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {player.playerName}
                          </span>
                          <div className="text-right">
                            <span className="text-lg font-bold text-gray-700">
                              {player.totalStrokes}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">strokes</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Share Card */}
      <div className="mt-8 rounded-2xl bg-[#003d2e] p-8 text-center shadow-xl">
        <h3 className="mb-2 text-2xl font-bold text-[#fff8e7]">Share This Leaderboard</h3>
        <p className="mb-6 text-[#fff8e7]/90">
          Anyone with this link can view the live leaderboard
        </p>
        <div className="mx-auto max-w-2xl rounded-lg bg-white/20 p-4 backdrop-blur-sm">
          <code className="break-all text-sm text-[#fff8e7]">
            {typeof window !== "undefined" ? window.location.origin : ""}/leaderboard/{round.id}
          </code>
        </div>
      </div>
    </div>
  );
}
