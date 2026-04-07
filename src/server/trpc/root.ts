import {
  createCallerFactory,
  createTRPCRouter,
} from "~/server/trpc/main";
import { signup } from "~/server/trpc/procedures/signup";
import { login } from "~/server/trpc/procedures/login";
import { getGameTemplates } from "~/server/trpc/procedures/getGameTemplates";
import { createRound } from "~/server/trpc/procedures/createRound";
import { getRound } from "~/server/trpc/procedures/getRound";
import { enterScore } from "~/server/trpc/procedures/enterScore";
import { getLeaderboard } from "~/server/trpc/procedures/getLeaderboard";
import { getUserRounds } from "~/server/trpc/procedures/getUserRounds";
import { createTournament } from "~/server/trpc/procedures/createTournament";
import { createTeamCupTournament } from "~/server/trpc/procedures/createTeamCupTournament";
import { getTournament } from "~/server/trpc/procedures/getTournament";
import { getTournamentLeaderboard } from "~/server/trpc/procedures/getTournamentLeaderboard";
import { getUserTournaments } from "~/server/trpc/procedures/getUserTournaments";
import { deleteRound } from "~/server/trpc/procedures/deleteRound";
import { completeRound } from "~/server/trpc/procedures/completeRound";
import { subscribeToRoundScores } from "~/server/trpc/procedures/subscribeToRoundScores";
import { joinTournament } from "~/server/trpc/procedures/joinTournament";
import { joinTournamentByCode } from "~/server/trpc/procedures/joinTournamentByCode";
import { updateHandicapOverride } from "~/server/trpc/procedures/updateHandicapOverride";
import { updateRoundCourse } from "~/server/trpc/procedures/updateRoundCourse";

export const appRouter = createTRPCRouter({
  // Authentication
  signup,
  login,
  
  // Game templates
  getGameTemplates,
  
  // Round management
  createRound,
  getRound,
  getUserRounds,
  deleteRound,
  completeRound,
  
  // Scoring
  enterScore,
  getLeaderboard,
  
  // Real-time subscriptions
  subscribeToRoundScores,
  
  // Tournament management
  createTournament,
  createTeamCupTournament,
  getTournament,
  getTournamentLeaderboard,
  getUserTournaments,
  joinTournament,
  joinTournamentByCode,

  // Tournament settings
  updateHandicapOverride,
  updateRoundCourse,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
