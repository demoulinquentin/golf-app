import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronRight, ChevronLeft, Home } from "lucide-react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { CourseSelector } from "~/components/CourseSelector";

const searchSchema = z.object({
  templateId: z.number().optional(),
});

export const Route = createFileRoute("/round/new/")({
  component: NewRoundPage,
  validateSearch: zodValidator(searchSchema),
});

type RoundFormData = {
  name: string;
  courseName: string;
  courseJson?: string; // Store the JSON string
  players: { name: string; handicap: number }[];
  // Custom rules configuration
  holeStructure: "18" | "9x2" | "6x3";
  teamConfiguration: "individual" | "2v2" | "allTeam";
  scoringMode: "strokePlay" | "bestBall" | "scramble" | "skins";
  handicapMode: "full" | "team" | "none";
  // Team names and colors
  team1Name: string;
  team1Color: string;
  team2Name: string;
  team2Color: string;
  allTeamName: string;
  allTeamColor: string;
};

function NewRoundPage() {
  const navigate = useNavigate();
  const { authToken, user } = useAuthStore();
  const trpc = useTRPC();
  const [step, setStep] = useState(1);
  const [courseJson, setCourseJson] = useState<string | undefined>(undefined);
  const { templateId } = Route.useSearch();

  // Fetch template if templateId is provided
  const templateQuery = useQuery({
    ...trpc.getGameTemplates.queryOptions(),
    select: (templates) => templates.find((t) => t.id === templateId),
    enabled: !!templateId,
  });

  const selectedTemplate = templateQuery.data;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RoundFormData>({
    defaultValues: {
      name: "",
      courseName: "",
      players: [
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
        { name: "", handicap: 0 },
      ],
      holeStructure: "18",
      teamConfiguration: "individual",
      scoringMode: "strokePlay",
      handicapMode: "full",
      team1Name: "Team 1",
      team1Color: "#059669",
      team2Name: "Team 2",
      team2Color: "#dc2626",
      allTeamName: "The Squad",
      allTeamColor: "#059669",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "players",
  });

  const createRoundMutation = useMutation(
    trpc.createRound.mutationOptions({
      onSuccess: (data) => {
        toast.success("Round created successfully!");
        void navigate({ to: "/round/$roundId", params: { roundId: String(data.roundId) } });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create round");
      },
    })
  );

  const onSubmit = (data: RoundFormData) => {
    if (!authToken) {
      toast.error("Please sign in to create a round");
      void navigate({ to: "/auth/login" });
      return;
    }

    // Filter out empty players
    const validPlayers = data.players.filter((p) => p.name.trim() !== "");

    if (validPlayers.length < 2) {
      toast.error("Please add at least 2 players");
      return;
    }

    // If using a template, submit with gameTemplateId
    if (templateId && selectedTemplate) {
      createRoundMutation.mutate({
        authToken,
        name: data.name,
        courseName: data.courseName,
        courseJson: courseJson,
        players: validPlayers,
        gameTemplateId: templateId,
      });
      return;
    }

    // Generate teams configuration based on team configuration choice
    let teams: { name: string; color: string; playerIndices: number[] }[] | undefined;
    
    if (data.teamConfiguration === "2v2" && validPlayers.length >= 4) {
      // Create 2v2 teams with custom names and colors
      teams = [
        {
          name: data.team1Name,
          color: data.team1Color,
          playerIndices: [0, 1],
        },
        {
          name: data.team2Name,
          color: data.team2Color,
          playerIndices: [2, 3],
        },
      ];
    } else if (data.teamConfiguration === "allTeam") {
      // All players on one team
      teams = [
        {
          name: data.allTeamName,
          color: data.allTeamColor,
          playerIndices: validPlayers.map((_, idx) => idx),
        },
      ];
    }

    // Generate teams config for rulesJson (for backward compatibility)
    let teamsConfig: number[][] | null = null;
    if (data.teamConfiguration === "2v2" && validPlayers.length >= 4) {
      teamsConfig = [[0, 1], [2, 3]];
    } else if (data.teamConfiguration === "allTeam") {
      teamsConfig = [validPlayers.map((_, idx) => idx)];
    }

    // Generate rulesJson based on hole structure
    const generateHoles = () => {
      const holes = [];
      for (let i = 0; i < 18; i++) {
        const holeConfig: any = {
          number: i + 1,
          teams: teamsConfig,
          scoringMode: data.scoringMode,
          handicapMode: data.handicapMode,
        };

        // Add segment information for 9x2 or 6x3 structures
        if (data.holeStructure === "9x2") {
          holeConfig.segment = i < 9 ? 1 : 2;
        } else if (data.holeStructure === "6x3") {
          holeConfig.segment = Math.floor(i / 6) + 1;
        }

        holes.push(holeConfig);
      }
      return holes;
    };

    const rulesJson = {
      holes: generateHoles(),
    };

    createRoundMutation.mutate({
      authToken,
      name: data.name,
      courseName: data.courseName,
      courseJson: courseJson,
      players: validPlayers,
      rulesJson: rulesJson,
      teams: teams,
    });
  };

  if (!authToken || !user) {
    void navigate({ to: "/auth/login" });
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4">
            <Link
              to="/"
              className="inline-flex items-center space-x-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <Home className="h-4 w-4" />
              <span>Back to Menu</span>
            </Link>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900">Create New Round</h1>
            <p className="mt-2 text-gray-600">Set up your game in a few simple steps</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          {(selectedTemplate ? [1, 2] : [1, 2, 3]).map((s, idx, arr) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
                  step >= s
                    ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                    : "bg-white text-gray-400"
                }`}
              >
                {s}
              </div>
              {idx < arr.length - 1 && (
                <div
                  className={`mx-2 h-1 w-16 ${step > s ? "bg-green-600" : "bg-gray-300"}`}
                ></div>
              )}
            </div>
          ))}
        </div>

        {/* Template Info Banner */}
        {selectedTemplate && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">Using Template</p>
                <h3 className="text-2xl font-bold">{selectedTemplate.name}</h3>
                <p className="mt-1 text-sm opacity-90">{selectedTemplate.description}</p>
              </div>
              <button
                onClick={() => void navigate({ to: "/round/new" })}
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium backdrop-blur-sm hover:bg-white/30"
              >
                Use Custom Rules Instead
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-900">Basic Information</h2>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Round Name
                  </label>
                  <input
                    type="text"
                    {...register("name", { required: "Round name is required" })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    placeholder="Saturday Morning Round"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <CourseSelector
                  onCourseSelected={(json, courseName, totalPar) => {
                    setCourseJson(json);
                    setValue("courseName", courseName);
                  }}
                  currentCourseName={watch("courseName")}
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
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
                <h2 className="text-2xl font-bold text-gray-900">Add Players</h2>

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start space-x-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          {...register(`players.${index}.name`)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          placeholder={`Player ${index + 1} Name`}
                        />
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.1"
                          {...register(`players.${index}.handicap`, { valueAsNumber: true })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                          placeholder="HCP"
                        />
                      </div>
                      {fields.length > 2 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
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
                  onClick={() => append({ name: "", handicap: 0 })}
                  className="flex items-center space-x-2 text-green-600 hover:text-green-700"
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
                  {selectedTemplate ? (
                    <button
                      type="submit"
                      disabled={createRoundMutation.isPending}
                      className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                    >
                      {createRoundMutation.isPending ? "Creating..." : "Create Round"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Custom Rules (only shown if no template selected) */}
            {step === 3 && !selectedTemplate && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Customize Game Rules</h2>
                  <p className="mt-2 text-gray-600">Configure your game mechanics and scoring</p>
                </div>

                {/* Hole Structure */}
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    Hole Structure
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("holeStructure") === "18"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="18"
                        {...register("holeStructure")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">18 Holes</p>
                        <p className="text-sm text-gray-600">Standard round</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("holeStructure") === "9x2"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="9x2"
                        {...register("holeStructure")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">9 Holes × 2</p>
                        <p className="text-sm text-gray-600">Two segments</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("holeStructure") === "6x3"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="6x3"
                        {...register("holeStructure")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">6 Holes × 3</p>
                        <p className="text-sm text-gray-600">Three segments</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Team Configuration */}
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    Team Configuration
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("teamConfiguration") === "individual"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="individual"
                        {...register("teamConfiguration")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Individual</p>
                        <p className="text-sm text-gray-600">Every player for themselves</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("teamConfiguration") === "2v2"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="2v2"
                        {...register("teamConfiguration")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">2v2 Teams</p>
                        <p className="text-sm text-gray-600">Two teams of two</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("teamConfiguration") === "allTeam"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="allTeam"
                        {...register("teamConfiguration")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">All Team</p>
                        <p className="text-sm text-gray-600">Everyone on one team</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Team Names (shown when team configuration is not individual) */}
                {watch("teamConfiguration") === "2v2" && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Team Names</h3>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Team 1 Name
                        </label>
                        <input
                          type="text"
                          {...register("team1Name")}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                        <label className="mb-2 mt-2 block text-sm font-medium text-gray-700">
                          Team 1 Color
                        </label>
                        <input
                          type="color"
                          {...register("team1Color")}
                          className="h-12 w-full rounded-lg border border-gray-300"
                        />
                      </div>
                      
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Team 2 Name
                        </label>
                        <input
                          type="text"
                          {...register("team2Name")}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                        <label className="mb-2 mt-2 block text-sm font-medium text-gray-700">
                          Team 2 Color
                        </label>
                        <input
                          type="color"
                          {...register("team2Color")}
                          className="h-12 w-full rounded-lg border border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {watch("teamConfiguration") === "allTeam" && (
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-gray-900">Team Name</h3>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Team Name
                    </label>
                    <input
                      type="text"
                      {...register("allTeamName")}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    />
                    <label className="mb-2 mt-2 block text-sm font-medium text-gray-700">
                      Team Color
                    </label>
                    <input
                      type="color"
                      {...register("allTeamColor")}
                      className="h-12 w-full rounded-lg border border-gray-300"
                    />
                  </div>
                )}

                {/* Scoring Mode */}
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    Scoring Mode
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("scoringMode") === "strokePlay"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="strokePlay"
                        {...register("scoringMode")}
                        className="sr-only"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Stroke Play</p>
                        <p className="text-sm text-gray-600">Lowest total score wins</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("scoringMode") === "bestBall"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="bestBall"
                        {...register("scoringMode")}
                        className="sr-only"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Best Ball</p>
                        <p className="text-sm text-gray-600">Best team score per hole</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("scoringMode") === "scramble"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="scramble"
                        {...register("scoringMode")}
                        className="sr-only"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Scramble</p>
                        <p className="text-sm text-gray-600">Play from best position</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("scoringMode") === "skins"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="skins"
                        {...register("scoringMode")}
                        className="sr-only"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">Skins</p>
                        <p className="text-sm text-gray-600">Win individual holes</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Handicap Mode */}
                <div>
                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    Handicap Mode
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("handicapMode") === "full"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="full"
                        {...register("handicapMode")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Full Handicap</p>
                        <p className="text-sm text-gray-600">Apply full handicaps</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("handicapMode") === "team"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="team"
                        {...register("handicapMode")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">Team Handicap</p>
                        <p className="text-sm text-gray-600">Combined team handicap</p>
                      </div>
                    </label>

                    <label
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                        watch("handicapMode") === "none"
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        value="none"
                        {...register("handicapMode")}
                        className="sr-only"
                      />
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">No Handicap</p>
                        <p className="text-sm text-gray-600">Gross scores only</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm font-medium text-green-900">Game Configuration Summary</p>
                  <ul className="mt-2 space-y-1 text-sm text-green-800">
                    <li>• Structure: {watch("holeStructure") === "18" ? "18 holes" : watch("holeStructure") === "9x2" ? "9 holes × 2" : "6 holes × 3"}</li>
                    <li>• Teams: {watch("teamConfiguration") === "individual" ? "Individual play" : watch("teamConfiguration") === "2v2" ? "2v2 teams" : "All on one team"}</li>
                    <li>• Scoring: {watch("scoringMode") === "strokePlay" ? "Stroke Play" : watch("scoringMode") === "bestBall" ? "Best Ball" : watch("scoringMode") === "scramble" ? "Scramble" : "Skins"}</li>
                    <li>• Handicaps: {watch("handicapMode") === "full" ? "Full handicap" : watch("handicapMode") === "team" ? "Team handicap" : "No handicap"}</li>
                  </ul>
                </div>

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
                    type="submit"
                    disabled={createRoundMutation.isPending}
                    className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                  >
                    {createRoundMutation.isPending ? "Creating..." : "Create Round"}
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
