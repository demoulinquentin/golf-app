import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuthStore } from "~/stores/authStore";
import { useTournamentAccessStore } from "~/stores/tournamentAccessStore";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronRight, ChevronLeft, Trophy, Calendar, Users, Copy, Check, Shield } from "lucide-react";
import { SegmentConfigForm } from "~/components/SegmentConfigForm";
import { CourseSelector } from "~/components/CourseSelector";
import { GameType, CourseFormat, generateSegmentsFromFormat } from "~/server/types/tournament";

export const Route = createFileRoute("/tournament/new/")({
  component: NewTournamentPage,
});

type TournamentFormData = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  players: { name: string; handicap: number }[];
  useGlobalTeams: boolean;
  globalTeams: { name: string; color: string; playerIndices: number[] }[];
  rounds: {
    name: string;
    courseName: string;
    courseJson?: string;
    courseFormat: CourseFormat;
    gameTemplateId?: number;
    segments: {
      segmentNumber: number;
      gameType: GameType;
      matchupFormat: 
        | { type: "2v2"; teams: [[number, number], [number, number]] }
        | { type: "1v1+1v1"; pairs: [[number, number], [number, number]] }
        | { type: "individual" }
        | { 
            type: "flexible"; 
            playerMatchup: {
              format: string;
              matches?: Array<{
                team1PlayerIndices?: [number, number];
                team2PlayerIndices?: [number, number];
                player1Index?: number;
                player2Index?: number;
              }>;
              team1PlayerIndices?: [number, number];
              team2PlayerIndices?: [number, number];
              match1?: [number, number];
              match2?: [number, number];
              playerIndices?: number[];
            };
          };
    }[];
    useCustomTeams: boolean;
    customTeams: { name: string; color: string; playerIndices: number[] }[];
  }[];
};

function NewTournamentPage() {
  const navigate = useNavigate();
  const { authToken, user } = useAuthStore();
  const { setAsAdmin } = useTournamentAccessStore();
  const trpc = useTRPC();
  const [step, setStep] = useState(1);
  const [createdTournament, setCreatedTournament] = useState<{ tournamentId: number; joinCode: string } | null>(null);
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);

  const templatesQuery = useQuery(trpc.getGameTemplates.queryOptions());

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TournamentFormData>({
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      players: [
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
      ],
      useGlobalTeams: false,
      globalTeams: [
        { name: "Team USA", color: "#3b82f6", playerIndices: [] },
        { name: "Team Europe", color: "#ef4444", playerIndices: [] },
      ],
      rounds: [
        {
          name: "Round 1",
          courseName: "",
          courseJson: undefined,
          courseFormat: CourseFormat.EIGHTEEN,
          segments: [
            {
              segmentNumber: 1,
              gameType: GameType.STROKE_PLAY,
              matchupFormat: { type: "individual" },
            },
          ],
          useCustomTeams: false,
          customTeams: [],
        },
      ],
    },
  });

  const { fields: playerFields, append: appendPlayer, remove: removePlayer } = useFieldArray({
    control,
    name: "players",
  });

  const { fields: roundFields, append: appendRound, remove: removeRound } = useFieldArray({
    control,
    name: "rounds",
  });

  const { fields: globalTeamFields, append: appendGlobalTeam, remove: removeGlobalTeam } = useFieldArray({
    control,
    name: "globalTeams",
  });

  // Helper to update segments when course format changes
  const updateSegmentsForFormat = (roundIndex: number, format: CourseFormat) => {
    const holeSegments = generateSegmentsFromFormat(format);
    const newSegments = holeSegments.map((holes, idx) => ({
      segmentNumber: idx + 1,
      gameType: GameType.STROKE_PLAY,
      matchupFormat: { type: "individual" as const },
    }));
    setValue(`rounds.${roundIndex}.segments`, newSegments);
  };

  const createTournamentMutation = useMutation(
    trpc.createTournament.mutationOptions({
      onSuccess: (data) => {
        // Mark the user as admin for this tournament
        setAsAdmin(data.tournamentId);
        
        // Show the join code modal
        setCreatedTournament({ tournamentId: data.tournamentId, joinCode: data.joinCode });
        toast.success("Tournament created successfully!");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create tournament");
      },
    })
  );

  const onSubmit = (data: TournamentFormData) => {
    const validPlayers = data.players.filter((p) => p.name.trim() !== "");

    if (validPlayers.length < 2) {
      toast.error("Please add at least 2 players");
      return;
    }

    if (data.rounds.length === 0) {
      toast.error("Please add at least 1 round");
      return;
    }

    // Prepare global teams if enabled
    const globalTeams = data.useGlobalTeams ? data.globalTeams.filter(t => t.playerIndices.length > 0) : undefined;

    // Prepare rounds data with segment configuration
    const rounds = data.rounds.map(round => ({
      name: round.name,
      courseName: round.courseName,
      courseJson: round.courseJson,
      courseFormat: round.courseFormat,
      segments: round.segments.map(seg => ({
        segmentNumber: seg.segmentNumber,
        gameType: seg.gameType,
        matchupFormat: seg.matchupFormat,
      })),
      teams: round.useCustomTeams ? round.customTeams.filter(t => t.playerIndices.length > 0) : undefined,
    }));

    createTournamentMutation.mutate({
      authToken: authToken || undefined,
      name: data.name,
      description: data.description,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      players: validPlayers,
      globalTeams,
      rounds,
    });
  };

  const handleCopyJoinCode = async () => {
    if (createdTournament) {
      await navigator.clipboard.writeText(createdTournament.joinCode);
      setCopiedJoinCode(true);
      setTimeout(() => setCopiedJoinCode(false), 2000);
      toast.success("Join code copied to clipboard!");
    }
  };

  const handleGoToTournament = () => {
    if (createdTournament) {
      void navigate({ 
        to: "/tournament/$tournamentId/leaderboard", 
        params: { tournamentId: String(createdTournament.tournamentId) } 
      });
    }
  };

  const validPlayers = watch("players").filter(p => p.name.trim() !== "");

  // Join Code Modal
  if (createdTournament) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <Check className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Tournament Created!</h2>
            <p className="mt-2 text-gray-600">Share this code with players to join</p>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">Join Code</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={createdTournament.joinCode}
                readOnly
                className="flex-1 rounded-lg border-2 border-purple-300 bg-purple-50 px-4 py-3 text-center text-2xl font-bold tracking-wider text-purple-900"
              />
              <button
                onClick={handleCopyJoinCode}
                className="rounded-lg border-2 border-purple-300 p-3 text-purple-600 hover:bg-purple-50"
              >
                {copiedJoinCode ? <Check className="h-6 w-6" /> : <Copy className="h-6 w-6" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleGoToTournament}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-purple-700 hover:to-pink-700"
          >
            Go to Tournament
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        {/* Team Cup Option */}
        <div className="mb-8 rounded-2xl border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center space-x-3">
                <Shield className="h-8 w-8 text-green-600" />
                <h3 className="text-2xl font-bold text-gray-900">Team Cup Format</h3>
              </div>
              <p className="text-gray-700 mb-3">
                Ryder Cup-style 3-day tournament with 2 teams of 3 players each
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
                  Day 1: Individual Net Leaderboard
                </span>
                <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
                  Day 2: 9 x 6-Hole Matchplay
                </span>
                <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
                  Day 3: Best Ball Team
                </span>
              </div>
            </div>
            <Link
              to="/tournament/new-team-cup"
              className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
            >
              <Trophy className="h-5 w-5" />
              <span>Create Team Cup</span>
            </Link>
          </div>
        </div>

        <div className="mb-6 text-center">
          <div className="inline-flex items-center space-x-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
            <span>or create a custom tournament below</span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white">
            <Trophy className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">Create Tournament</h1>
          <p className="mt-2 text-gray-600">Build your custom multi-round competition</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          {[1, 2, 3, 4].map((s, idx, arr) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
                  step >= s
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                    : "bg-white text-gray-400"
                }`}
              >
                {s}
              </div>
              {idx < arr.length - 1 && (
                <div
                  className={`mx-2 h-1 w-16 ${step > s ? "bg-purple-600" : "bg-gray-300"}`}
                ></div>
              )}
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 1: Tournament Info */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3 text-purple-600">
                  <Trophy className="h-6 w-6" />
                  <h2 className="text-2xl font-bold text-gray-900">Tournament Details</h2>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Tournament Name *
                  </label>
                  <input
                    type="text"
                    {...register("name", { required: "Tournament name is required" })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    placeholder="Summer Championship 2024"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    {...register("description")}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    placeholder="A friendly competition over multiple rounds..."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      <Calendar className="mb-1 inline h-4 w-4" /> Start Date
                    </label>
                    <input
                      type="date"
                      {...register("startDate")}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      <Calendar className="mb-1 inline h-4 w-4" /> End Date
                    </label>
                    <input
                      type="date"
                      {...register("endDate")}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-purple-700 hover:to-pink-700"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Players */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center space-x-3 text-purple-600">
                  <Users className="h-6 w-6" />
                  <h2 className="text-2xl font-bold text-gray-900">Add Players</h2>
                </div>

                <div className="space-y-4">
                  {playerFields.map((field, index) => (
                    <div key={field.id} className="flex items-start space-x-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          {...register(`players.${index}.name`)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                          placeholder={`Player ${index + 1} Name`}
                        />
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.1"
                          {...register(`players.${index}.handicap`, { valueAsNumber: true })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                          placeholder="HCP"
                        />
                      </div>
                      {playerFields.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removePlayer(index)}
                          className="rounded-lg border border-red-300 p-3 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => appendPlayer({ name: "", handicap: 0 })}
                  className="flex items-center space-x-2 text-purple-600 hover:text-purple-700"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add Player</span>
                </button>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center space-x-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-purple-700 hover:to-pink-700"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Global Teams (Optional) */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Team Configuration</h2>
                <p className="text-gray-600">Set up teams that will compete across all rounds (Ryder Cup style)</p>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    {...register("useGlobalTeams")}
                    className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Enable Global Teams (players stay on same team across all rounds)
                  </label>
                </div>

                {watch("useGlobalTeams") && (
                  <div className="space-y-6">
                    {globalTeamFields.map((field, teamIndex) => (
                      <div key={field.id} className="rounded-xl border-2 border-gray-200 p-6">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <input
                              type="text"
                              {...register(`globalTeams.${teamIndex}.name`)}
                              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              placeholder="Team Name"
                            />
                            <input
                              type="color"
                              {...register(`globalTeams.${teamIndex}.color`)}
                              className="h-10 w-20 rounded-lg border border-gray-300"
                            />
                          </div>
                          {globalTeamFields.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeGlobalTeam(teamIndex)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Assign Players:</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {validPlayers.map((player, playerIndex) => (
                              <label
                                key={playerIndex}
                                className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={watch(`globalTeams.${teamIndex}.playerIndices`)?.includes(playerIndex) || false}
                                  onChange={(e) => {
                                    const currentIndices = watch(`globalTeams.${teamIndex}.playerIndices`) || [];
                                    if (e.target.checked) {
                                      setValue(`globalTeams.${teamIndex}.playerIndices`, [...currentIndices, playerIndex]);
                                    } else {
                                      setValue(`globalTeams.${teamIndex}.playerIndices`, currentIndices.filter(i => i !== playerIndex));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-900">{player.name} (HCP: {player.handicap})</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => appendGlobalTeam({ name: `Team ${globalTeamFields.length + 1}`, color: "#6366f1", playerIndices: [] })}
                      className="flex items-center space-x-2 text-purple-600 hover:text-purple-700"
                    >
                      <Plus className="h-5 w-5" />
                      <span>Add Team</span>
                    </button>
                  </div>
                )}

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-purple-700 hover:to-pink-700"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Rounds */}
            {step === 4 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Configure Rounds</h2>
                <p className="text-gray-600">Add and configure each round of the tournament</p>

                <div className="space-y-6">
                  {roundFields.map((field, roundIndex) => {
                    const courseFormat = watch(`rounds.${roundIndex}.courseFormat`);
                    const segments = watch(`rounds.${roundIndex}.segments`) || [];
                    const holeSegments = generateSegmentsFromFormat(courseFormat);
                    
                    return (
                      <div key={field.id} className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-6">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-bold text-gray-900">Round {roundIndex + 1}</h3>
                          {roundFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRound(roundIndex)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-gray-700">
                                Round Name
                              </label>
                              <input
                                type="text"
                                {...register(`rounds.${roundIndex}.name`)}
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                placeholder={`Round ${roundIndex + 1}`}
                              />
                            </div>
                            </div>

                          {/* Course Selector */}
                          <CourseSelector
                            onCourseSelected={(json, courseName, totalPar) => {
                              setValue(`rounds.${roundIndex}.courseJson`, json);
                              setValue(`rounds.${roundIndex}.courseName`, courseName);
                            }}
                            currentCourseName={watch(`rounds.${roundIndex}.courseName`)}
                          />

                          {/* Course Format Selection */}
                          <div>
                            <label className="mb-3 block text-sm font-medium text-gray-700">
                              Course Format
                            </label>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <label
                                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                                  courseFormat === CourseFormat.EIGHTEEN
                                    ? "border-purple-600 bg-purple-50"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <input
                                  type="radio"
                                  value={CourseFormat.EIGHTEEN}
                                  checked={courseFormat === CourseFormat.EIGHTEEN}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setValue(`rounds.${roundIndex}.courseFormat`, CourseFormat.EIGHTEEN);
                                      updateSegmentsForFormat(roundIndex, CourseFormat.EIGHTEEN);
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className="text-center">
                                  <p className="font-semibold text-gray-900">1 × 18 Holes</p>
                                  <p className="text-sm text-gray-600">One full round</p>
                                </div>
                              </label>

                              <label
                                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                                  courseFormat === CourseFormat.NINE_X_TWO
                                    ? "border-purple-600 bg-purple-50"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <input
                                  type="radio"
                                  value={CourseFormat.NINE_X_TWO}
                                  checked={courseFormat === CourseFormat.NINE_X_TWO}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setValue(`rounds.${roundIndex}.courseFormat`, CourseFormat.NINE_X_TWO);
                                      updateSegmentsForFormat(roundIndex, CourseFormat.NINE_X_TWO);
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className="text-center">
                                  <p className="font-semibold text-gray-900">2 × 9 Holes</p>
                                  <p className="text-sm text-gray-600">Two segments</p>
                                </div>
                              </label>

                              <label
                                className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                                  courseFormat === CourseFormat.SIX_X_THREE
                                    ? "border-purple-600 bg-purple-50"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <input
                                  type="radio"
                                  value={CourseFormat.SIX_X_THREE}
                                  checked={courseFormat === CourseFormat.SIX_X_THREE}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setValue(`rounds.${roundIndex}.courseFormat`, CourseFormat.SIX_X_THREE);
                                      updateSegmentsForFormat(roundIndex, CourseFormat.SIX_X_THREE);
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className="text-center">
                                  <p className="font-semibold text-gray-900">3 × 6 Holes</p>
                                  <p className="text-sm text-gray-600">Three segments</p>
                                </div>
                              </label>
                            </div>
                          </div>

                          {/* Segment Configuration */}
                          <div className="space-y-4">
                            <h4 className="text-md font-semibold text-gray-900">
                              Configure Segments
                            </h4>
                            {segments.map((segment: any, segmentIndex: number) => (
                              <SegmentConfigForm
                                key={segmentIndex}
                                roundIndex={roundIndex}
                                segmentIndex={segmentIndex}
                                segmentNumber={segment.segmentNumber}
                                holes={holeSegments[segmentIndex] || []}
                                playerCount={validPlayers.length}
                                players={validPlayers}
                                globalTeams={watch("useGlobalTeams") ? watch("globalTeams") : undefined}
                                register={register}
                                watch={watch}
                                setValue={setValue}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => appendRound({ 
                    name: `Round ${roundFields.length + 1}`, 
                    courseName: "", 
                    courseJson: undefined,
                    courseFormat: CourseFormat.EIGHTEEN,
                    segments: [
                      {
                        segmentNumber: 1,
                        gameType: GameType.STROKE_PLAY,
                        matchupFormat: { type: "individual" },
                      },
                    ],
                    useCustomTeams: false, 
                    customTeams: [] 
                  })}
                  className="flex items-center space-x-2 text-purple-600 hover:text-purple-700"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add Round</span>
                </button>

                <div className="rounded-lg bg-purple-50 p-4">
                  <p className="text-sm font-medium text-purple-900">Tournament Summary</p>
                  <ul className="mt-2 space-y-1 text-sm text-purple-800">
                    <li>• {validPlayers.length} players</li>
                    <li>• {roundFields.length} rounds</li>
                    {watch("useGlobalTeams") && (
                      <li>• {globalTeamFields.filter(t => watch(`globalTeams.${globalTeamFields.indexOf(t)}.playerIndices`)?.length > 0).length} global teams</li>
                    )}
                  </ul>
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center space-x-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={createTournamentMutation.isPending}
                    className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 font-semibold text-white shadow-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
                  >
                    {createTournamentMutation.isPending ? "Creating..." : "Create Tournament"}
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
