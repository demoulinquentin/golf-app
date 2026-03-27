import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTRPCClient } from "~/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import { useState } from "react";
import { Trophy, Users, Check, Eye, ArrowRight, KeyRound } from "lucide-react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/tournament/join/")({
  component: JoinTournamentByCodePage,
});

function JoinTournamentByCodePage() {
  const navigate = useNavigate();
  const trpcClient = useTRPCClient();
  const { setPlayerIdentity, getTournamentAccess } = useTournamentAccessStore();
  const [joinCode, setJoinCode] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [tournamentData, setTournamentData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const lookupTournament = async () => {
    if (!joinCode.trim()) {
      toast.error("Please enter a join code");
      return;
    }

    setIsLoading(true);
    try {
      const data = await trpcClient.joinTournamentByCode.query({
        joinCode: joinCode.trim().toUpperCase()
      });
      setTournamentData(data);
      
      // Check if user already has access
      const existingAccess = getTournamentAccess(data.tournament.id);
      if (existingAccess) {
        toast.success("You're already part of this tournament!");
        void navigate({
          to: "/tournament/$tournamentId/leaderboard",
          params: { tournamentId: String(data.tournament.id) },
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Tournament not found");
      setTournamentData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinAsPlayer = () => {
    if (!selectedPlayerId || !tournamentData) {
      toast.error("Please select a player");
      return;
    }

    const player = tournamentData.players.find((p: any) => p.id === selectedPlayerId);
    if (!player) {
      toast.error("Player not found");
      return;
    }

    // Store player identity locally
    setPlayerIdentity(
      tournamentData.tournament.id,
      selectedPlayerId,
      player.name,
      false // Not admin
    );

    toast.success(`Welcome, ${player.name}!`);
    void navigate({
      to: "/tournament/$tournamentId/leaderboard",
      params: { tournamentId: String(tournamentData.tournament.id) },
    });
  };

  const handleJoinAsViewer = () => {
    if (!tournamentData) return;

    // Store as viewer (no player ID)
    setPlayerIdentity(
      tournamentData.tournament.id,
      0, // Use 0 to indicate viewer mode
      "Viewer",
      false
    );

    toast.success("Joined as viewer");
    void navigate({
      to: "/tournament/$tournamentId/leaderboard",
      params: { tournamentId: String(tournamentData.tournament.id) },
    });
  };

  return (
    <div className="min-h-screen bg-[#fff8e7]">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#003d2e] text-[#ffd700]">
            <Trophy className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">Join Tournament</h1>
          <p className="mt-2 text-lg text-gray-600">
            Enter the tournament code to get started
          </p>
        </div>

        {/* Code Entry */}
        {!tournamentData && (
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-6">
              <label className="mb-3 block text-sm font-medium text-gray-700">
                Tournament Code
              </label>
              <div className="flex items-center space-x-3">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void lookupTournament();
                      }
                    }}
                    placeholder="e.g., GOLF123"
                    className="w-full rounded-lg border border-gray-300 py-4 pl-12 pr-4 text-lg font-mono uppercase tracking-wider focus:border-[#003d2e] focus:outline-none focus:ring-2 focus:ring-[#003d2e]/20"
                    maxLength={10}
                  />
                </div>
                <button
                  onClick={() => void lookupTournament()}
                  disabled={isLoading || !joinCode.trim()}
                  className="flex items-center space-x-2 rounded-lg bg-[#003d2e] px-6 py-4 font-semibold text-[#fff8e7] shadow-lg hover:bg-[#00261c] disabled:opacity-50"
                >
                  <span>{isLoading ? "Looking up..." : "Continue"}</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-[#e8f5e9] p-4">
              <p className="text-sm text-[#003d2e]">
                <strong>Don't have a code?</strong> Ask the tournament organizer for the join code.
                It's usually displayed on the tournament page.
              </p>
            </div>
          </div>
        )}

        {/* Tournament Found - Player Selection */}
        {tournamentData && (
          <>
            {/* Tournament Info */}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="mb-2 text-2xl font-bold text-gray-900">
                {tournamentData.tournament.name}
              </h2>
              {tournamentData.tournament.description && (
                <p className="mb-4 text-gray-600">{tournamentData.tournament.description}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>{tournamentData.players.length} players</span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    tournamentData.tournament.status === "completed"
                      ? "bg-blue-100 text-blue-700"
                      : tournamentData.tournament.status === "in_progress"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {tournamentData.tournament.status === "completed"
                    ? "Completed"
                    : tournamentData.tournament.status === "in_progress"
                    ? "In Progress"
                    : "Not Started"}
                </span>
              </div>
            </div>

            {/* Player Selection */}
            <div className="mb-6 rounded-2xl bg-white p-8 shadow-xl">
              <h3 className="mb-6 text-xl font-bold text-gray-900">Who are you?</h3>
              <p className="mb-6 text-gray-600">Select your name from the list below:</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {tournamentData.players.map((player: any) => (
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

            {/* Back button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setTournamentData(null);
                  setJoinCode("");
                  setSelectedPlayerId(null);
                }}
                className="text-sm text-[#003d2e] hover:text-[#00261c]"
              >
                ← Enter a different code
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
