import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "~/stores/authStore";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import { useTRPC } from "~/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronRight, ChevronLeft, Trophy, Calendar, Users, Copy, Check, Shield } from "lucide-react";
import { CourseSelector } from "~/components/CourseSelector";

export const Route = createFileRoute("/tournament/new-team-cup/")({
  component: NewTeamCupPage,
});

type TeamCupFormData = {
  name: string;
  startDate: string;
  endDate: string;
  teams: [
    {
      name: string;
      color: string;
      players: [
        { name: string; handicap: number },
        { name: string; handicap: number },
        { name: string; handicap: number }
      ];
    },
    {
      name: string;
      color: string;
      players: [
        { name: string; handicap: number },
        { name: string; handicap: number },
        { name: string; handicap: number }
      ];
    }
  ];
  day1: {
    courseName: string;
    courseJson?: string;
  };
  day2: {
    courseName: string;
    courseJson?: string;
    party1: [number, number, number];
    party2: [number, number, number];
    matches: Array<{
      segmentNumber: number;
      player1Index: number;
      player2Index: number;
      type: "within-party" | "blind";
    }>;
  };
  day3: {
    courseName: string;
    courseJson?: string;
    party1: [number, number, number];
    party2: [number, number, number];
  };
};

function NewTeamCupPage() {
  const navigate = useNavigate();
  const { authToken } = useAuthStore();
  const { setAsAdmin } = useTournamentAccessStore();
  const trpc = useTRPC();
  const [step, setStep] = useState(1);
  const [createdTournament, setCreatedTournament] = useState<{ tournamentId: number; joinCode: string } | null>(null);
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TeamCupFormData>({
    defaultValues: {
      name: "",
      startDate: "",
      endDate: "",
      teams: [
        {
          name: "Team Europe",
          color: "#3b82f6",
          players: [
            { name: "", handicap: 0 },
            { name: "", handicap: 0 },
            { name: "", handicap: 0 },
          ],
        },
        {
          name: "Team USA",
          color: "#ef4444",
          players: [
            { name: "", handicap: 0 },
            { name: "", handicap: 0 },
            { name: "", handicap: 0 },
          ],
        },
      ],
      day1: {
        courseName: "",
        courseJson: undefined,
      },
      day2: {
        courseName: "",
        courseJson: undefined,
        party1: [0, 1, 2],
        party2: [3, 4, 5],
        matches: [],
      },
      day3: {
        courseName: "",
        courseJson: undefined,
        party1: [0, 3, 4],
        party2: [1, 2, 5],
      },
    },
  });

  const teams = watch("teams");
  const day2Matches = watch("day2.matches");

  const createTournamentMutation = useMutation(
    trpc.createTeamCupTournament.mutationOptions({
      onSuccess: (data) => {
        setCreatedTournament(data);
        setAsAdmin(data.tournamentId);
        toast.success("Team Cup tournament created successfully!");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create tournament");
      },
    })
  );

  const onSubmit = (data: TeamCupFormData) => {
    createTournamentMutation.mutate({
      ...data,
      authToken: authToken || undefined,
    });
  };

  const copyJoinCode = () => {
    if (createdTournament) {
      navigator.clipboard.writeText(createdTournament.joinCode);
      setCopiedJoinCode(true);
      setTimeout(() => setCopiedJoinCode(false), 2000);
      toast.success("Join code copied!");
    }
  };

  const getAllPlayers = () => {
    const players: Array<{ name: string; teamIndex: number; playerIndex: number }> = [];
    teams.forEach((team, teamIdx) => {
      team.players.forEach((player, playerIdx) => {
        players.push({
          name: player.name || `Player ${teamIdx * 3 + playerIdx + 1}`,
          teamIndex: teamIdx,
          playerIndex: teamIdx * 3 + playerIdx,
        });
      });
    });
    return players;
  };

  const addMatch = () => {
    const currentMatches = watch("day2.matches");
    setValue("day2.matches", [
      ...currentMatches,
      {
        segmentNumber: 1,
        player1Index: 0,
        player2Index: 3,
        type: "within-party" as const,
      },
    ]);
  };

  const removeMatch = (index: number) => {
    const currentMatches = watch("day2.matches");
    setValue(
      "day2.matches",
      currentMatches.filter((_, i) => i !== index)
    );
  };

  if (createdTournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-600 text-white shadow-xl">
            <Check className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Tournament Created!</h2>
          <p className="text-gray-600 mb-6">Your Team Cup tournament is ready. Share the join code with players.</p>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">Join Code</p>
            <div className="flex items-center justify-center space-x-2">
              <code className="text-2xl font-bold text-green-600">{createdTournament.joinCode}</code>
              <button
                onClick={copyJoinCode}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {copiedJoinCode ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Copy className="h-5 w-5 text-gray-600" />
                )}
              </button>
            </div>
          </div>

          <button
            onClick={() => void navigate({ 
              to: "/tournament/$tournamentId/leaderboard", 
              params: { tournamentId: String(createdTournament.tournamentId) } 
            })}
            className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
          >
            Go to Tournament
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-emerald-600 text-white shadow-xl">
            <Shield className="h-10 w-10" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900">Create Team Cup</h1>
          <p className="mt-2 text-lg text-gray-600">Ryder Cup-style 3-day tournament</p>
          <div className="mt-4 inline-flex items-center space-x-2 rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-800">
            <Trophy className="h-4 w-4" />
            <span>2 Teams • 3 Players Each • 3 Days • 39 Points Total</span>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          {[1, 2, 3, 4, 5].map((s, idx, arr) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
                  step >= s
                    ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg"
                    : "bg-white text-gray-400"
                }`}
              >
                {s}
              </div>
              {idx < arr.length - 1 && (
                <div
                  className={`mx-2 h-1 w-12 ${step > s ? "bg-green-600" : "bg-gray-300"}`}
                ></div>
              )}
            </div>
          ))}
        </div>

        {/* Form Steps */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 1: Tournament Info */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Tournament Details</h2>
                
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Tournament Name *
                  </label>
                  <input
                    type="text"
                    {...register("name", { required: true })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    placeholder="Masters Team Cup 2024"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">Tournament name is required</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      type="date"
                      {...register("startDate")}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      End Date
                    </label>
                    <input
                      type="date"
                      {...register("endDate")}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                  >
                    <span>Next: Teams</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Teams */}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Team Setup</h2>
                <p className="text-gray-600">Configure both teams with 3 players each</p>

                <div className="grid gap-6 lg:grid-cols-2">
                  {[0, 1].map((teamIdx) => (
                    <div key={teamIdx} className="rounded-lg border-2 border-gray-200 p-6">
                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Team Name
                        </label>
                        <input
                          type="text"
                          {...register(`teams.${teamIdx}.name` as const)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Team Color
                        </label>
                        <input
                          type="color"
                          {...register(`teams.${teamIdx}.color` as const)}
                          className="h-10 w-full rounded-lg border border-gray-300"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <p className="flex-1 text-sm font-medium text-gray-700">Players</p>
                          <p className="w-20 text-sm font-medium text-gray-700">Handicap</p>
                        </div>
                        {[0, 1, 2].map((playerIdx) => (
                          <div key={playerIdx} className="flex gap-2">
                            <input
                              type="text"
                              {...register(`teams.${teamIdx}.players.${playerIdx}.name` as const)}
                              placeholder={`Player ${playerIdx + 1} name`}
                              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                            />
                            <input
                              type="number"
                              step="0.1"
                              {...register(`teams.${teamIdx}.players.${playerIdx}.handicap` as const, {
                                valueAsNumber: true,
                              })}
                              placeholder="HCP"
                              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center space-x-2 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                  >
                    <span>Next: Courses</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Courses */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Course Selection</h2>
                <p className="text-gray-600">Select courses for each of the 3 days</p>

                {/* Day 1 */}
                <div className="rounded-lg border-2 border-gray-200 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Day 1 - Practice Round</h3>
                  <CourseSelector
                    onCourseSelected={(json, courseName) => {
                      setValue("day1.courseJson", json);
                      setValue("day1.courseName", courseName);
                    }}
                    currentCourseName={watch("day1.courseName")}
                  />
                </div>

                {/* Day 2 */}
                <div className="rounded-lg border-2 border-gray-200 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Day 2 - Match Play</h3>
                  <CourseSelector
                    onCourseSelected={(json, courseName) => {
                      setValue("day2.courseJson", json);
                      setValue("day2.courseName", courseName);
                    }}
                    currentCourseName={watch("day2.courseName")}
                  />
                </div>

                {/* Day 3 */}
                <div className="rounded-lg border-2 border-gray-200 p-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Day 3 - Singles</h3>
                  <CourseSelector
                    onCourseSelected={(json, courseName) => {
                      setValue("day3.courseJson", json);
                      setValue("day3.courseName", courseName);
                    }}
                    currentCourseName={watch("day3.courseName")}
                  />
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                  >
                    <span>Next: Day 2 Matches</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Day 2 Match Schedule */}
            {step === 4 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Day 2 Match Schedule</h2>
                <p className="text-gray-600">Configure 9 matches across 3 segments (3 matches per segment)</p>

                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Party 1:</strong> {getAllPlayers().slice(0, 3).map(p => p.name).join(", ")}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Party 2:</strong> {getAllPlayers().slice(3, 6).map(p => p.name).join(", ")}
                  </p>
                </div>

                <div className="space-y-4">
                  {day2Matches.map((match, idx) => (
                    <div key={idx} className="rounded-lg border-2 border-gray-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900">Match {idx + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removeMatch(idx)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Segment
                          </label>
                          <select
                            {...register(`day2.matches.${idx}.segmentNumber` as const, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          >
                            <option value={1}>Segment 1</option>
                            <option value={2}>Segment 2</option>
                            <option value={3}>Segment 3</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Player 1
                          </label>
                          <select
                            {...register(`day2.matches.${idx}.player1Index` as const, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          >
                            {getAllPlayers().map((player) => (
                              <option key={player.playerIndex} value={player.playerIndex}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Player 2
                          </label>
                          <select
                            {...register(`day2.matches.${idx}.player2Index` as const, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          >
                            {getAllPlayers().map((player) => (
                              <option key={player.playerIndex} value={player.playerIndex}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Match Type
                        </label>
                        <select
                          {...register(`day2.matches.${idx}.type` as const)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        >
                          <option value="within-party">Within Party</option>
                          <option value="blind">Blind Draw</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {day2Matches.length < 9 && (
                  <button
                    type="button"
                    onClick={addMatch}
                    className="flex w-full items-center justify-center space-x-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 font-semibold text-gray-600 hover:border-green-500 hover:text-green-600"
                  >
                    <Plus className="h-5 w-5" />
                    <span>Add Match ({day2Matches.length}/9)</span>
                  </button>
                )}

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center space-x-2 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                  >
                    <span>Next: Day 3 Parties</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Day 3 Party Assignments */}
            {step === 5 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Day 3 Party Assignments</h2>
                <p className="text-gray-600">Assign players to parties for singles matches</p>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Party 1 */}
                  <div className="rounded-lg border-2 border-gray-200 p-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Party 1</h3>
                    <div className="space-y-3">
                      {[0, 1, 2].map((idx) => (
                        <div key={idx}>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Player {idx + 1}
                          </label>
                          <select
                            {...register(`day3.party1.${idx}` as const, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          >
                            {getAllPlayers().map((player) => (
                              <option key={player.playerIndex} value={player.playerIndex}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Party 2 */}
                  <div className="rounded-lg border-2 border-gray-200 p-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Party 2</h3>
                    <div className="space-y-3">
                      {[0, 1, 2].map((idx) => (
                        <div key={idx}>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Player {idx + 1}
                          </label>
                          <select
                            {...register(`day3.party2.${idx}` as const, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          >
                            {getAllPlayers().map((player) => (
                              <option key={player.playerIndex} value={player.playerIndex}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm text-green-800">
                    <strong>Note:</strong> Day 3 features 6 singles matches (1 point each) for a total of 6 points.
                  </p>
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex items-center space-x-2 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={createTournamentMutation.isPending}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                  >
                    <Trophy className="h-5 w-5" />
                    <span>
                      {createTournamentMutation.isPending ? "Creating..." : "Create Tournament"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
