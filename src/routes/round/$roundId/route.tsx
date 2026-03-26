import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trophy, Target, Home, Trash2, CheckCircle } from "lucide-react";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import toast from "react-hot-toast";
import { useState } from "react";

export const Route = createFileRoute("/round/$roundId")({
  component: RoundLayout,
});

function RoundLayout() {
  const { roundId } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { getTournamentAccess } = useTournamentAccessStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const roundQuery = useQuery(
    trpc.getRound.queryOptions({ roundId: parseInt(roundId) })
  );

  // Get tournament access if round is part of a tournament
  const tournamentAccess = roundQuery.data?.tournamentId
    ? getTournamentAccess(roundQuery.data.tournamentId)
    : null;
  const isAdmin = tournamentAccess?.isAdmin || false;

  const deleteRoundMutation = useMutation(
    trpc.deleteRound.mutationOptions({
      onSuccess: () => {
        toast.success("Round deleted successfully");
        void navigate({ to: "/" });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete round");
      },
    })
  );

  const completeRoundMutation = useMutation(
    trpc.completeRound.mutationOptions({
      onSuccess: () => {
        toast.success("Round completed! Great game!");
        void roundQuery.refetch();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to complete round");
      },
    })
  );

  const handleDeleteRound = () => {
    if (!isAdmin) {
      toast.error("Only the tournament admin can delete rounds");
      return;
    }
    deleteRoundMutation.mutate({
      roundId: parseInt(roundId),
      requestingPlayerId: tournamentAccess?.playerId || undefined,
      isAdmin,
    });
  };

  const handleCompleteRound = () => {
    if (!isAdmin) {
      toast.error("Only the tournament admin can complete rounds");
      return;
    }
    completeRoundMutation.mutate({
      roundId: parseInt(roundId),
      requestingPlayerId: tournamentAccess?.playerId || undefined,
      isAdmin,
    });
  };

  if (roundQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
          <p className="text-lg font-medium text-gray-700">Loading round...</p>
        </div>
      </div>
    );
  }

  if (roundQuery.isError || !roundQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">Round not found</p>
          <Link to="/" className="mt-4 text-green-600 hover:text-green-700">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const round = roundQuery.data;

  // Check if all scores are entered
  const isFullyScored = round.players.length > 0 && 
    round.scores.length === round.players.length * 18;
  
  const isCompleted = round.status === "completed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100">
      {/* Header */}
      <div className="border-b border-green-200/50 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Link
                to={round.tournamentId ? "/tournament/$tournamentId/leaderboard" : "/"}
                params={round.tournamentId ? { tournamentId: String(round.tournamentId) } : {}}
                className="inline-flex items-center space-x-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <Home className="h-4 w-4" />
                <span>{round.tournamentId ? "Back to Leaderboard" : "Back to Menu"}</span>
              </Link>
            </div>
            
            <div className="flex-1 text-center">
              <h1 className="text-3xl font-bold text-gray-900">{round.name}</h1>
              <p className="text-gray-600">{round.courseName}</p>
              {isCompleted && (
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  Completed
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {isAdmin && !isCompleted && isFullyScored && (
                <button
                  onClick={handleCompleteRound}
                  disabled={completeRoundMutation.isPending}
                  className="inline-flex items-center space-x-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white shadow-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Complete Round</span>
                </button>
              )}
              
            </div>
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Delete Round?</h3>
            <p className="mb-6 text-gray-600">
              Are you sure you want to delete this round? This action cannot be undone and will delete all scores and data.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  handleDeleteRound();
                }}
                disabled={deleteRoundMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteRoundMutation.isPending ? "Deleting..." : "Delete Round"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <Outlet />
    </div>
  );
}
