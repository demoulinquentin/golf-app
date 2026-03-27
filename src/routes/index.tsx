import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trophy, Users, Target } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#fff8e7]">
      {/* Navigation */}
      <nav className="border-b border-[#003d2e]/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#003d2e] text-[#fff8e7]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">GolfScore Pro</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/templates"
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Templates
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl md:text-7xl">
              <span className="block">Score Your Round.</span>
              <span className="block text-[#003d2e]">
                Track Every Shot.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-gray-600">
              The ultimate golf scoring app for groups. Configure complex game formats, manage tournaments, and share live leaderboards in real-time.
            </p>
            <div className="mt-10 flex justify-center space-x-4">
              <button
                onClick={() => void navigate({ to: "/tournament/new" })}
                className="rounded-xl bg-[#003d2e] px-8 py-4 text-lg font-semibold text-[#fff8e7] shadow-xl transition-all hover:bg-[#00261c] hover:shadow-2xl"
              >
                Create Tournament
              </button>
              <button
                onClick={() => void navigate({ to: "/tournament/join" })}
                className="rounded-xl border-2 border-[#003d2e] bg-white px-8 py-4 text-lg font-semibold text-[#003d2e] transition-all hover:bg-[#e8f5e9]"
              >
                Join Tournament
              </button>
            </div>
          </div>

          {/* Features */}
          <div className="mt-24 grid gap-8 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-8 shadow-xl">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
                <Trophy className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">Live Leaderboards</h3>
              <p className="text-gray-600">
                Real-time scoring with beautiful leaderboards. Share with your group or club instantly.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-xl">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">No Login Required</h3>
              <p className="text-gray-600">
                Create a tournament, share the link, and players join instantly. No accounts needed.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-xl">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#003d2e]">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">Flexible Formats</h3>
              <p className="text-gray-600">
                Stroke Play, Stableford, Match Play, Scramble - configure any game format you want.
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="mt-24">
            <h2 className="mb-12 text-center text-4xl font-bold text-gray-900">How It Works</h2>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f5e9] text-[#003d2e]">
                  <span className="text-2xl font-bold">1</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-gray-900">Create Tournament</h3>
                <p className="text-gray-600">
                  Set up your tournament with players, rounds, and game formats
                </p>
              </div>
              <div className="text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#fff8e7] text-[#ffd700]">
                  <span className="text-2xl font-bold">2</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-gray-900">Share Join Code</h3>
                <p className="text-gray-600">
                  Get a simple join code (e.g., "GOLF123") and share it with all players
                </p>
              </div>
              <div className="text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#003d2e] text-[#ffd700]">
                  <span className="text-2xl font-bold">3</span>
                </div>
                <h3 className="mb-2 text-xl font-bold text-gray-900">Start Playing</h3>
                <p className="text-gray-600">
                  Players enter the code, select their name, and start scoring in real-time
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
