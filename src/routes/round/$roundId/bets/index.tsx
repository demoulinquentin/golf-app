import { createFileRoute } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Plus, Users, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/round/$roundId/bets/")({
  component: BetsPage,
});

function BetsPage() {
  const { roundId } = Route.useParams();
  const trpc = useTRPC();

  const roundQuery = useQuery(
    trpc.getRound.queryOptions({ roundId: parseInt(roundId) })
  );

  if (!roundQuery.data) {
    return null;
  }

  const round = roundQuery.data;
  const players = round.players.map((rp) => rp.player);

  // Mock bet data for MVP
  const mockBets = [
    {
      id: 1,
      type: "Nassau",
      amount: 20,
      description: "Front 9, Back 9, and Overall",
      participants: players.slice(0, 2),
      status: "active",
      currentWinner: players[0]?.name || "TBD",
    },
    {
      id: 2,
      type: "Skins",
      amount: 5,
      description: "Per hole - lowest score wins",
      participants: players,
      status: "active",
      skinsWon: 3,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Betting Ledger</h2>
          <p className="text-gray-600">Track wagers and payouts</p>
        </div>
        <button className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700">
          <Plus className="h-5 w-5" />
          <span>Add Bet</span>
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-6 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Pot</p>
              <p className="text-2xl font-bold text-gray-900">$45</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Active Bets</p>
              <p className="text-2xl font-bold text-gray-900">{mockBets.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Participants</p>
              <p className="text-2xl font-bold text-gray-900">{players.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Bets */}
      <div className="mb-8 space-y-6">
        <h3 className="text-xl font-bold text-gray-900">Active Bets</h3>

        {mockBets.map((bet) => (
          <div key={bet.id} className="rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center space-x-3">
                  <h4 className="text-xl font-bold text-gray-900">{bet.type}</h4>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-600">
                    Active
                  </span>
                </div>
                <p className="text-gray-600">{bet.description}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">${bet.amount}</p>
                <p className="text-sm text-gray-600">per player</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Participants</p>
                  <div className="mt-2 flex -space-x-2">
                    {bet.participants.map((player, idx) => (
                      <div
                        key={idx}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-600 text-xs font-semibold text-white ring-2 ring-white"
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-600">Current Leader</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{bet.currentWinner}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Payout Summary */}
      <div className="rounded-2xl bg-white p-8 shadow-xl">
        <h3 className="mb-6 text-xl font-bold text-gray-900">Projected Payouts</h3>

        <div className="space-y-4">
          {players.map((player, idx) => {
            // Mock payout calculation
            const mockPayout = idx === 0 ? 25 : idx === 1 ? -10 : -5;
            return (
              <div key={player.id} className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-600 text-sm font-semibold text-white">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-gray-900">{player.name}</span>
                </div>
                <div className={`text-xl font-bold ${mockPayout >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {mockPayout >= 0 ? "+" : ""}${mockPayout}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            <strong>Note:</strong> Payouts will be calculated automatically at the end of the round based on final scores and bet outcomes.
          </p>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <div className="mt-8 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-600 p-8 text-center shadow-xl">
        <h3 className="mb-2 text-2xl font-bold text-white">Full Betting Features Coming Soon</h3>
        <p className="text-green-50">
          Automated payout calculations, custom bet types, and payment integration
        </p>
      </div>
    </div>
  );
}
