import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import { useState } from "react";
import { Trophy, Users, Check, Eye } from "lucide-react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/tournament/join/$shareableLink/")({
  component: JoinTournamentPage,
});

function JoinTournamentPage() {
  const { shareableLink } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { setPlayerIdentity, getTournamentAccess } = useTournamentAccessStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const tournamentQuery = useQuery(
    trpc.joinTournament.queryOptions({ shareableLink })
  );

  const handleJoinAsPlayer = () => {
    if (!selectedPlayerId || !tournamentQuery.data) {
      toast.error("Please select a player");
      return;
    }

    const player = tournamentQuery.data.players.find(p => p.id === selectedPlayerId);
    if (!player) {
      toast.error("Player not found");
      return;
    }

    // Store player identity locally
    setPlayerIdentity(
      tournamentQuery.data.tournament.id,
      selectedPlayerId,
      player.name,
      false // Not admin
    );

    toast.success(`Welcome, ${player.name}!`);
    void navigate({
      to: "/tournament/$tournamentId/leaderboard",
      params: { tournamentId: String(tournamentQuery.data.tournament.id) },
    });
  };

  const handleJoinAsViewer = () => {
    if (!tournamentQuery.data) return;

    // Store as viewer (no player ID)
    setPlayerIdentity(
      tournamentQuery.data.tournament.id,
      0, // Use 0 to indicate viewer mode
      "Viewer",
      false
    );

    toast.success("Joined as viewer");
    void navigate({
      to: "/tournament/$tournamentId/leaderboard",
      params: { tournamentId: String(tournamentQuery.data.tournament.id) },
    });
  };

  if (tournamentQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#003d2e] border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700">Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (tournamentQuery.isError || !tournamentQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Tournament Not Found</h2>
          <p className="text-gray-600">
            {tournamentQuery.error?.message || "This tournament link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  const { tournament, players } = tournamentQuery.data;

  // Check if user already has access
  const existingAccess = getTournamentAccess(tournament.id);
  if (existingAccess) {
    // Already joined, redirect to tournament
    void navigate({
      to: "/tournament/$tournamentId/leaderboard",
      params: { tournamentId: String(tournament.id) },
      replace: true,
    });
    return null;
  }

  return (
    <div className="min-h-screen bg-[#fff8e7]">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#003d2e] text-[#ffd700]">
            <Trophy className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">Join Tournament</h1>
          <p className="mt-2 text-lg text-gray-600">
            You've been invited to join <span className="font-semibold text-[#003d2e]">{tournament.name}</span>
          </p>
        </div>

        {/* Tournament Info */}
        <div className="mb-8 rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">{tournament.name}</h2>
          {tournament.description && (
            <p className="mb-6 text-gray-600">{tournament.description}</p>
          )}
          <div className="flex items-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>{players.length} players</span>
            </div>
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

        {/* Player Selection */}
        <div className="mb-8 rounded-2xl bg-white p-8 shadow-xl">
          <h3 className="mb-6 text-xl font-bold text-gray-900">Who are you?</h3>
          <p className="mb-6 text-gray-600">Select your name from the list below:</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => setSelectedPlayerId(player.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  selectedPlayerId === player.id
                    ? "border-[#003d2e] bg-[#e8f5e9]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{player.name}</p>
                    <p className="text-sm text-gray-600">Handicap: {player.handicap}</p>
                  </div>
                  {selectedPlayerId === player.id && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#003d2e] text-[#fff8e7]">
                      <Check className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleJoinAsPlayer}
            disabled={!selectedPlayerId}
            className="mt-6 w-full rounded-lg bg-[#003d2e] py-4 text-lg font-semibold text-[#fff8e7] shadow-lg hover:bg-[#00261c] disabled:opacity-50"
          >
            Join as Selected Player
          </button>
        </div>

        {/* Or Join as Viewer */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h3 className="mb-4 text-xl font-bold text-gray-900">Just want to watch?</h3>
          <p className="mb-6 text-gray-600">
            You can join as a viewer to see the leaderboard and scores without playing.
          </p>
          <button
            onClick={handleJoinAsViewer}
            className="flex w-full items-center justify-center space-x-2 rounded-lg border-2 border-[#003d2e] py-4 text-lg font-semibold text-[#003d2e] hover:bg-[#e8f5e9]"
          >
            <Eye className="h-5 w-5" />
            <span>Join as Viewer</span>
          </button>
        </div>
      </div>
    </div>
  );
}
