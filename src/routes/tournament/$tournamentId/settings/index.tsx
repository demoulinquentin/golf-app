import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Pencil,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import { PRELOADED_COURSES } from "~/data/courses";
import toast from "react-hot-toast";

export const Route = createFileRoute(
  "/tournament/$tournamentId/settings/"
)({
  component: TournamentSettingsPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type HoleData = { hole: number; par: number; strokeIndex: number };

// ─── Main Component ─────────────────────────────────────────────────────────

function TournamentSettingsPage() {
  const { tournamentId } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAdminFor } = useTournamentAccessStore();

  const isAdmin = isAdminFor(parseInt(tournamentId));

  const tournamentQuery = useQuery(
    trpc.getTournament.queryOptions({ tournamentId: parseInt(tournamentId) })
  );

  // Redirect non-admins
  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <Lock className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-lg font-medium text-gray-700">
            Only the tournament admin can access settings
          </p>
          <Link
            to="/tournament/$tournamentId/leaderboard"
            params={{ tournamentId }}
            className="mt-4 inline-block text-[#003d2e] hover:text-[#00261c] underline"
          >
            Back to Leaderboard
          </Link>
        </div>
      </div>
    );
  }

  if (tournamentQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#003d2e] border-t-transparent" />
          <p className="text-lg font-medium text-gray-700">
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  if (!tournamentQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fff8e7]">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">
            Tournament not found
          </p>
          <Link to="/" className="mt-4 text-[#003d2e] hover:text-[#00261c]">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const tournament = tournamentQuery.data;

  return (
    <div className="min-h-screen bg-[#fff8e7]">
      {/* Header */}
      <div className="border-b border-[#003d2e]/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4 py-6">
            <Link
              to="/tournament/$tournamentId/leaderboard"
              params={{ tournamentId }}
              className="rounded-full bg-gray-100 p-2 hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tournament Settings
              </h1>
              <p className="text-sm text-gray-600">{tournament.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Section 1: Player Handicaps */}
        <HandicapSection
          tournament={tournament}
          tournamentId={parseInt(tournamentId)}
        />

        {/* Section 2: Courses */}
        <CoursesSection
          tournament={tournament}
          tournamentId={parseInt(tournamentId)}
        />

        {/* Section 3: Round Status / Mark as Completed */}
        <RoundStatusSection
          tournament={tournament}
          tournamentId={parseInt(tournamentId)}
        />
      </div>
    </div>
  );
}

// ─── Section 1: Handicap Overrides ──────────────────────────────────────────

function HandicapSection({
  tournament,
  tournamentId,
}: {
  tournament: any;
  tournamentId: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Build a map of all players across rounds
  const allPlayers: Map<
    number,
    { id: number; name: string; defaultHandicap: number }
  > = new Map();

  for (const round of tournament.rounds) {
    for (const rp of round.players) {
      if (!allPlayers.has(rp.player.id)) {
        allPlayers.set(rp.player.id, {
          id: rp.player.id,
          name: rp.player.name,
          defaultHandicap: rp.player.handicap,
        });
      }
    }
  }

  const players = Array.from(allPlayers.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Initialize handicap values from current data
  const getInitialHandicaps = () => {
    const map: Record<string, string> = {};
    for (const round of tournament.rounds) {
      for (const rp of round.players) {
        const key = `${round.id}-${rp.player.id}`;
        map[key] =
          rp.handicapOverride !== null && rp.handicapOverride !== undefined
            ? String(rp.handicapOverride)
            : String(rp.player.handicap);
      }
    }
    return map;
  };

  const [handicapValues, setHandicapValues] = useState<Record<string, string>>(
    getInitialHandicaps
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const updateMutation = useMutation(
    trpc.updateHandicapOverride.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.getTournament.queryKey({
            tournamentId,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.getTournamentLeaderboard.queryKey({
            tournamentId,
          }),
        });
        toast.success("Handicap updated");
        setSavingKey(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update handicap");
        setSavingKey(null);
      },
    })
  );

  const handleHandicapChange = (
    roundId: number,
    playerId: number,
    value: string
  ) => {
    const key = `${roundId}-${playerId}`;
    setHandicapValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveHandicap = (
    roundId: number,
    playerId: number,
    defaultHandicap: number
  ) => {
    const key = `${roundId}-${playerId}`;
    const value = handicapValues[key];
    const numValue = value ? parseFloat(value) : null;

    // If the value equals the default, set override to null
    const override =
      numValue !== null && numValue !== defaultHandicap ? numValue : null;

    setSavingKey(key);
    updateMutation.mutate({
      tournamentId,
      roundId,
      playerId,
      handicapOverride: override,
      isAdmin: true,
    });
  };

  const isRoundCompleted = (roundId: number) => {
    const round = tournament.rounds.find((r: any) => r.id === roundId);
    return round?.status === "completed";
  };

  const getOriginalValue = (roundId: number, playerId: number): string => {
    for (const round of tournament.rounds) {
      if (round.id === roundId) {
        for (const rp of round.players) {
          if (rp.player.id === playerId) {
            return rp.handicapOverride !== null &&
              rp.handicapOverride !== undefined
              ? String(rp.handicapOverride)
              : String(rp.player.handicap);
          }
        }
      }
    }
    return "";
  };

  const hasChanged = (roundId: number, playerId: number): boolean => {
    const key = `${roundId}-${playerId}`;
    return handicapValues[key] !== getOriginalValue(roundId, playerId);
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center space-x-3">
        <Pencil className="h-6 w-6 text-[#003d2e]" />
        <h2 className="text-xl font-bold text-gray-900">Player Handicaps</h2>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        Override handicaps per round per player. Leave as-is to use the
        player&apos;s default handicap.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 text-xs text-gray-500">
              <th className="py-3 pr-4 text-left font-medium">Player</th>
              <th className="py-3 pr-4 text-center font-medium">Default</th>
              {tournament.rounds.map((round: any, idx: number) => (
                <th
                  key={round.id}
                  className="py-3 px-2 text-center font-medium"
                >
                  <div>{round.name}</div>
                  {isRoundCompleted(round.id) && (
                    <span className="text-[10px] text-blue-600">(Locked)</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap">
                  {player.name}
                </td>
                <td className="py-3 pr-4 text-center text-gray-500">
                  {player.defaultHandicap}
                </td>
                {tournament.rounds.map((round: any) => {
                  const key = `${round.id}-${player.id}`;
                  const completed = isRoundCompleted(round.id);
                  const isPlayerInRound = round.players.some(
                    (rp: any) => rp.player.id === player.id
                  );

                  if (!isPlayerInRound) {
                    return (
                      <td
                        key={round.id}
                        className="py-3 px-2 text-center text-gray-300"
                      >
                        -
                      </td>
                    );
                  }

                  return (
                    <td key={round.id} className="py-3 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          value={handicapValues[key] ?? ""}
                          onChange={(e) =>
                            handleHandicapChange(
                              round.id,
                              player.id,
                              e.target.value
                            )
                          }
                          disabled={completed}
                          className={`w-16 rounded-lg border px-2 py-1.5 text-center text-sm ${
                            completed
                              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : hasChanged(round.id, player.id)
                              ? "border-[#ffd700] bg-[#fff8e7] text-gray-900"
                              : "border-gray-200 text-gray-900"
                          }`}
                        />
                        {hasChanged(round.id, player.id) && !completed && (
                          <button
                            onClick={() =>
                              handleSaveHandicap(
                                round.id,
                                player.id,
                                player.defaultHandicap
                              )
                            }
                            disabled={savingKey === key}
                            className="rounded-lg bg-[#003d2e] p-1.5 text-white hover:bg-[#00261c] disabled:opacity-50"
                            title="Save"
                          >
                            <Save className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section 2: Courses ─────────────────────────────────────────────────────

function CoursesSection({
  tournament,
  tournamentId,
}: {
  tournament: any;
  tournamentId: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  const updateCourseMutation = useMutation(
    trpc.updateRoundCourse.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.getTournament.queryKey({ tournamentId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.getTournamentLeaderboard.queryKey({ tournamentId }),
        });
        toast.success("Course updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update course");
      },
    })
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center space-x-3">
        <svg
          className="h-6 w-6 text-[#003d2e]"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
          />
        </svg>
        <h2 className="text-xl font-bold text-gray-900">Courses</h2>
      </div>

      <div className="space-y-4">
        {tournament.rounds.map((round: any, idx: number) => (
          <CourseRoundCard
            key={round.id}
            round={round}
            roundIndex={idx}
            tournamentId={tournamentId}
            isExpanded={expandedRound === round.id}
            onToggleExpand={() =>
              setExpandedRound(
                expandedRound === round.id ? null : round.id
              )
            }
            onSave={(courseName: string, holeData: HoleData[]) => {
              updateCourseMutation.mutate({
                tournamentId,
                roundId: round.id,
                courseName,
                holeData,
                isAdmin: true,
              });
            }}
            isSaving={updateCourseMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function CourseRoundCard({
  round,
  roundIndex,
  tournamentId,
  isExpanded,
  onToggleExpand,
  onSave,
  isSaving,
}: {
  round: any;
  roundIndex: number;
  tournamentId: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave: (courseName: string, holeData: HoleData[]) => void;
  isSaving: boolean;
}) {
  const currentHoleData: HoleData[] =
    (round.holeData as HoleData[]) ||
    Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: 4,
      strokeIndex: i + 1,
    }));

  const [selectedCourseId, setSelectedCourseId] = useState<string>("custom");
  const [courseName, setCourseName] = useState(round.courseName);
  const [holeData, setHoleData] = useState<HoleData[]>(currentHoleData);
  const [hasChanges, setHasChanges] = useState(false);

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    if (courseId === "custom") return;

    const course = PRELOADED_COURSES.find((c) => c.id === courseId);
    if (course) {
      setCourseName(course.name);
      setHoleData(course.holes);
      setHasChanges(true);
    }
  };

  const handleHoleDataChange = (
    holeIndex: number,
    field: "par" | "strokeIndex",
    value: number
  ) => {
    setHoleData((prev) => {
      const updated = [...prev];
      updated[holeIndex] = { ...updated[holeIndex]!, [field]: value };
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(courseName, holeData);
    setHasChanges(false);
  };

  const totalPar = holeData.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggleExpand}
      >
        <div>
          <p className="text-sm font-medium text-[#003d2e]">
            Round {roundIndex + 1}
          </p>
          <p className="font-semibold text-gray-900">{round.courseName}</p>
          <p className="text-xs text-gray-500">Par {round.coursePar || totalPar}</p>
        </div>
        <div className="flex items-center gap-2">
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
              : "Setup"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 space-y-4">
          {/* Course selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Course
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => handleCourseSelect(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="custom">-- Custom / Current --</option>
              {PRELOADED_COURSES.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} (Par {course.par})
                </option>
              ))}
            </select>
          </div>

          {/* Course name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course Name
            </label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => {
                setCourseName(e.target.value);
                setHasChanges(true);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Hole data table */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Hole Data (Par: {totalPar})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 px-1 text-left font-medium">Hole</th>
                    {holeData.map((h) => (
                      <th
                        key={h.hole}
                        className="py-2 px-1 text-center font-medium"
                      >
                        {h.hole}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-1 font-medium text-gray-700">
                      Par
                    </td>
                    {holeData.map((h, i) => (
                      <td key={h.hole} className="py-1 px-0.5">
                        <input
                          type="number"
                          min="3"
                          max="6"
                          value={h.par}
                          onChange={(e) =>
                            handleHoleDataChange(
                              i,
                              "par",
                              parseInt(e.target.value) || 4
                            )
                          }
                          className="w-8 sm:w-10 rounded border border-gray-200 px-1 py-1 text-center text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-1 font-medium text-gray-700">SI</td>
                    {holeData.map((h, i) => (
                      <td key={h.hole} className="py-1 px-0.5">
                        <input
                          type="number"
                          min="1"
                          max="18"
                          value={h.strokeIndex}
                          onChange={(e) =>
                            handleHoleDataChange(
                              i,
                              "strokeIndex",
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-8 sm:w-10 rounded border border-gray-200 px-1 py-1 text-center text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Save button */}
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full rounded-lg bg-[#003d2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#00261c] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Course Changes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Round Status / Mark as Completed ────────────────────────────

function RoundStatusSection({
  tournament,
  tournamentId,
}: {
  tournament: any;
  tournamentId: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmingRoundId, setConfirmingRoundId] = useState<number | null>(
    null
  );

  const completeRoundMutation = useMutation(
    trpc.completeRound.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.getTournament.queryKey({ tournamentId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.getTournamentLeaderboard.queryKey({ tournamentId }),
        });
        toast.success("Round marked as completed! Scores are now locked.");
        setConfirmingRoundId(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to complete round");
        setConfirmingRoundId(null);
      },
    })
  );

  const handleCompleteRound = (roundId: number) => {
    completeRoundMutation.mutate({
      roundId,
      isAdmin: true,
    });
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-6 flex items-center space-x-3">
        <CheckCircle2 className="h-6 w-6 text-[#003d2e]" />
        <h2 className="text-xl font-bold text-gray-900">
          Round Status & Score Locking
        </h2>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        Mark rounds as completed to lock scores. Only admins can edit scores
        after a round is locked.
      </p>

      <div className="space-y-4">
        {tournament.rounds.map((round: any, idx: number) => {
          const isCompleted = round.status === "completed";
          const isInProgress = round.status === "in_progress";
          const isConfirming = confirmingRoundId === round.id;

          // Count scores
          const totalPlayers = round.players.length;
          const totalExpectedScores = totalPlayers * 18;
          const totalActualScores = round.scores?.length || 0;
          const scorePercentage =
            totalExpectedScores > 0
              ? Math.round((totalActualScores / totalExpectedScores) * 100)
              : 0;

          return (
            <div
              key={round.id}
              className={`rounded-xl border-2 p-4 ${
                isCompleted
                  ? "border-blue-200 bg-blue-50"
                  : isInProgress
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      Round {idx + 1}: {round.name}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isCompleted
                          ? "bg-blue-100 text-blue-700"
                          : isInProgress
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {isCompleted
                        ? "Completed"
                        : isInProgress
                        ? "In Progress"
                        : "Setup"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {round.courseName} - {totalPlayers} players
                  </p>
                  <div className="mt-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>
                        Scores: {totalActualScores}/{totalExpectedScores} ({scorePercentage}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-gray-200">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          scorePercentage === 100
                            ? "bg-[#003d2e]"
                            : scorePercentage > 50
                            ? "bg-green-500"
                            : "bg-yellow-500"
                        }`}
                        style={{ width: `${scorePercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <div className="flex items-center gap-2 text-blue-700">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Scores Locked
                      </span>
                    </div>
                  ) : isConfirming ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-700 text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Lock scores for this round?</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCompleteRound(round.id)}
                          disabled={completeRoundMutation.isPending}
                          className="rounded-lg bg-[#003d2e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00261c] disabled:opacity-50"
                        >
                          {completeRoundMutation.isPending
                            ? "Completing..."
                            : "Yes, Complete"}
                        </button>
                        <button
                          onClick={() => setConfirmingRoundId(null)}
                          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingRoundId(round.id)}
                      className="rounded-lg bg-[#003d2e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00261c] transition-colors flex items-center gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark as Completed
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
