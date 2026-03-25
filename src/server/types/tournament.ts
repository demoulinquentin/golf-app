export enum GameType {
  SCRAMBLE = "scramble",
  STROKE_PLAY = "strokePlay",
  STABLEFORD = "stableford",
  LEADERBOARD_NET = "leaderboardNet", // Day 1: Individual net strokeplay with position-based points
  MATCHPLAY_6HOLE = "matchplay6hole", // Day 2: 6-hole net matchplay segments
  BEST_BALL_TEAM = "bestBallTeam", // Day 3: Team best ball matchplay + score bonus
}

export enum CourseFormat {
  EIGHTEEN = "1x18",
  NINE_X_TWO = "2x9",
  SIX_X_THREE = "3x6",
}

export enum MatchFormat {
  FOURSOMES = "foursomes",        // Alternate shot - 2 players per side
  FOURBALL = "fourball",          // Best ball - 2 players per side
  SINGLES = "singles",            // 1v1 match play
  TWO_VS_TWO = "2v2",            // 2v2 team format (existing)
  ONE_VS_ONE_DOUBLE = "1v1+1v1", // Two separate 1v1 matches (existing)
  INDIVIDUAL = "individual",      // Every player for themselves
  FLEXIBLE = "flexible",          // Flexible format with custom team sizes
}

/**
 * Defines which players participate in a match and how they're grouped
 * playerIndices are indices into the round's player array
 */
export type PlayerMatchup = 
  | { 
      format: MatchFormat.FOURSOMES | MatchFormat.FOURBALL;
      matches: Array<{
        team1PlayerIndices: [number, number];
        team2PlayerIndices: [number, number];
      }>;
    }
  | { 
      format: MatchFormat.SINGLES;
      matches: Array<{
        player1Index: number;
        player2Index: number;
      }>;
    }
  | { 
      format: MatchFormat.TWO_VS_TWO;
      team1PlayerIndices: [number, number];
      team2PlayerIndices: [number, number];
    }
  | { 
      format: MatchFormat.ONE_VS_ONE_DOUBLE;
      match1: [number, number];
      match2: [number, number];
    }
  | { 
      format: MatchFormat.INDIVIDUAL;
      playerIndices: number[];
    }
  | {
      format: MatchFormat.FLEXIBLE;
      matches: Array<{
        sides: number[][]; // Array of sides, each side is an array of player indices
      }>;
    };

export type MatchupFormat = 
  // Legacy format for backward compatibility
  | { type: "2v2"; teams: [[number, number], [number, number]] }
  | { type: "1v1+1v1"; pairs: [[number, number], [number, number]] }
  | { type: "individual" }
  // New flexible format with explicit player selection
  | { type: "flexible"; playerMatchup: PlayerMatchup };

export interface SegmentConfig {
  segmentNumber: number;
  holes: number[]; // e.g., [1,2,3,4,5,6] for first segment of 3x6
  gameType: GameType;
  matchupFormat: MatchupFormat;
  participatingPlayerIndices?: number[]; // Optional: which players participate in this segment
}

export interface CourseConfig {
  courseFormat: CourseFormat;
  segments: SegmentConfig[];
}

export interface TournamentRulesJson {
  courseFormat: CourseFormat;
  segments: SegmentConfig[];
  holes: {
    number: number;
    segmentNumber: number;
    gameType: GameType;
    matchupFormat: MatchupFormat;
  }[];
}

/**
 * Represents a single 6-hole matchplay for Team Cup Day 2
 */
export interface TeamCupMatch {
  id: string;
  segmentNumber: number; // 1, 2, or 3 (holes 1-6, 7-12, 13-18)
  player1Index: number;
  player2Index: number;
  type: "within-party" | "blind"; // Within same party or cross-party (blind)
  partyNumber?: number; // Which party this match belongs to (for within-party matches)
}

/**
 * Team Cup Day 2 configuration with 9 matches across 3 segments
 */
export interface TeamCupDay2Config {
  party1PlayerIndices: [number, number, number]; // 3 players in party 1
  party2PlayerIndices: [number, number, number]; // 3 players in party 2
  matches: TeamCupMatch[]; // 9 total matches
}

/**
 * Team Cup Day 3 configuration
 */
export interface TeamCupDay3Config {
  party1PlayerIndices: [number, number, number];
  party2PlayerIndices: [number, number, number];
}

/**
 * Complete Team Cup configuration
 */
export interface TeamCupConfig {
  teams: [
    { id: string; name: string; color: string; playerIndices: [number, number, number] },
    { id: string; name: string; color: string; playerIndices: [number, number, number] }
  ];
  day1: {
    courseId: string;
    courseName: string;
  };
  day2: {
    courseId: string;
    courseName: string;
    config: TeamCupDay2Config;
  };
  day3: {
    courseId: string;
    courseName: string;
    config: TeamCupDay3Config;
  };
}

/**
 * Converts legacy MatchupFormat to PlayerMatchup
 */
export function legacyToPlayerMatchup(format: MatchupFormat): PlayerMatchup | null {
  if (format.type === "2v2") {
    return {
      format: MatchFormat.TWO_VS_TWO,
      team1PlayerIndices: format.teams[0],
      team2PlayerIndices: format.teams[1],
    };
  }
  if (format.type === "1v1+1v1") {
    return {
      format: MatchFormat.ONE_VS_ONE_DOUBLE,
      match1: format.pairs[0],
      match2: format.pairs[1],
    };
  }
  if (format.type === "individual") {
    return {
      format: MatchFormat.INDIVIDUAL,
      playerIndices: [], // Will be filled with all players
    };
  }
  if (format.type === "flexible") {
    return format.playerMatchup;
  }
  return null;
}

/**
 * Gets all player indices participating in a matchup
 */
export function getParticipatingPlayers(matchup: PlayerMatchup): number[] {
  switch (matchup.format) {
    case MatchFormat.FOURSOMES:
    case MatchFormat.FOURBALL:
      return matchup.matches.flatMap(m => [
        ...m.team1PlayerIndices,
        ...m.team2PlayerIndices,
      ]);
    case MatchFormat.SINGLES:
      return matchup.matches.flatMap(m => [m.player1Index, m.player2Index]);
    case MatchFormat.TWO_VS_TWO:
      return [...matchup.team1PlayerIndices, ...matchup.team2PlayerIndices];
    case MatchFormat.ONE_VS_ONE_DOUBLE:
      return [...matchup.match1, ...matchup.match2];
    case MatchFormat.INDIVIDUAL:
      return matchup.playerIndices;
    case MatchFormat.FLEXIBLE:
      return matchup.matches.flatMap(m => m.sides.flat());
  }
}

/**
 * Validates that a matchup format is compatible with the game type and number of players
 */
export function validateMatchupCompatibility(
  gameType: GameType,
  matchupFormat: MatchupFormat,
  playerCount: number
): { valid: boolean; error?: string } {
  // Scramble requires team play
  if (gameType === GameType.SCRAMBLE) {
    if (matchupFormat.type === "individual") {
      return { valid: false, error: "Scramble requires team play" };
    }
    if (matchupFormat.type === "flexible") {
      const playerMatchup = matchupFormat.playerMatchup;
      if (playerMatchup.format === MatchFormat.INDIVIDUAL) {
        return { valid: false, error: "Scramble requires team play" };
      }
    }
  }

  // Legacy format validation
  if (matchupFormat.type === "2v2" && playerCount !== 4) {
    return { valid: false, error: "2v2 format requires exactly 4 players" };
  }
  if (matchupFormat.type === "1v1+1v1" && playerCount !== 4) {
    return { valid: false, error: "1v1+1v1 format requires exactly 4 players" };
  }

  // New flexible format validation
  if (matchupFormat.type === "flexible") {
    const playerMatchup = matchupFormat.playerMatchup;
    const participatingPlayers = getParticipatingPlayers(playerMatchup);
    
    // Check all player indices are valid
    const invalidIndices = participatingPlayers.filter(idx => idx < 0 || idx >= playerCount);
    if (invalidIndices.length > 0) {
      return { valid: false, error: `Invalid player indices: ${invalidIndices.join(", ")}` };
    }
    
    // Check for duplicate players in the same segment
    const uniquePlayers = new Set(participatingPlayers);
    if (uniquePlayers.size !== participatingPlayers.length) {
      return { valid: false, error: "A player cannot be assigned to multiple matches in the same segment" };
    }
  }

  return { valid: true };
}

/**
 * Generates segment configurations based on course format
 */
export function generateSegmentsFromFormat(format: CourseFormat): number[][] {
  switch (format) {
    case CourseFormat.EIGHTEEN:
      return [Array.from({ length: 18 }, (_, i) => i + 1)];
    case CourseFormat.NINE_X_TWO:
      return [
        Array.from({ length: 9 }, (_, i) => i + 1),
        Array.from({ length: 9 }, (_, i) => i + 10),
      ];
    case CourseFormat.SIX_X_THREE:
      return [
        Array.from({ length: 6 }, (_, i) => i + 1),
        Array.from({ length: 6 }, (_, i) => i + 7),
        Array.from({ length: 6 }, (_, i) => i + 13),
      ];
  }
}

/**
 * Calculates Stableford points based on strokes and par
 * Standard scoring: Eagle or better = 4, Birdie = 3, Par = 2, Bogey = 1, Double bogey or worse = 0
 */
export function calculateStablefordPoints(strokes: number, par: number, handicapStrokes: number = 0): number {
  const netStrokes = strokes - handicapStrokes;
  const scoreToPar = netStrokes - par;
  
  if (scoreToPar <= -2) return 4; // Eagle or better
  if (scoreToPar === -1) return 3; // Birdie
  if (scoreToPar === 0) return 2;  // Par
  if (scoreToPar === 1) return 1;  // Bogey
  return 0; // Double bogey or worse
}

/**
 * Validates that a Team Cup Day 2 match schedule has exactly 9 matches
 * with every cross-team pairing appearing exactly once
 */
export function validateTeamCupDay2Matches(
  matches: TeamCupMatch[],
  team1PlayerIndices: number[],
  team2PlayerIndices: number[]
): { valid: boolean; error?: string } {
  if (matches.length !== 9) {
    return { valid: false, error: "Day 2 must have exactly 9 matches" };
  }

  // Check that each segment has 3 matches
  const segmentCounts = [0, 0, 0];
  for (const match of matches) {
    if (match.segmentNumber < 1 || match.segmentNumber > 3) {
      return { valid: false, error: "Segment number must be 1, 2, or 3" };
    }
    segmentCounts[match.segmentNumber - 1]++;
  }

  if (!segmentCounts.every(count => count === 3)) {
    return { valid: false, error: "Each segment must have exactly 3 matches" };
  }

  // Check that every cross-team pairing appears exactly once
  const pairings = new Set<string>();
  for (const match of matches) {
    const isTeam1Player1 = team1PlayerIndices.includes(match.player1Index);
    const isTeam1Player2 = team1PlayerIndices.includes(match.player2Index);
    const isTeam2Player1 = team2PlayerIndices.includes(match.player1Index);
    const isTeam2Player2 = team2PlayerIndices.includes(match.player2Index);

    // Ensure it's a cross-team match
    if ((isTeam1Player1 && isTeam1Player2) || (isTeam2Player1 && isTeam2Player2)) {
      return { valid: false, error: "All matches must be between players from different teams" };
    }

    // Create a normalized pairing key (smaller index first)
    const key = [match.player1Index, match.player2Index].sort((a, b) => a - b).join("-");
    if (pairings.has(key)) {
      return { valid: false, error: `Duplicate pairing found: ${key}` };
    }
    pairings.add(key);
  }

  // Check that we have exactly 9 unique pairings (3x3 = 9)
  if (pairings.size !== 9) {
    return { valid: false, error: "Must have exactly 9 unique cross-team pairings" };
  }

  return { valid: true };
}

/**
 * Calculates points for Team Cup Day 1 (Individual Net Strokeplay)
 * Position-based points: 1st=6, 2nd=5, 3rd=4, 4th=3, 5th=2, 6th=1
 * Ties split the points for tied positions
 */
export function calculateTeamCupDay1Points(
  position: number,
  tiedCount: number = 1
): number {
  const basePoints = [6, 5, 4, 3, 2, 1];
  
  if (position < 1 || position > 6) {
    return 0;
  }

  if (tiedCount === 1) {
    return basePoints[position - 1];
  }

  // Calculate average points for tied positions
  let totalPoints = 0;
  for (let i = 0; i < tiedCount; i++) {
    const pos = position + i - 1;
    if (pos >= 0 && pos < basePoints.length) {
      totalPoints += basePoints[pos];
    }
  }

  return totalPoints / tiedCount;
}

/**
 * Calculates the result of a 6-hole net matchplay
 * Returns points for each player: win=1, tie=0.5, loss=0
 */
export function calculateTeamCupDay2MatchResult(
  player1NetScore: number,
  player2NetScore: number
): { player1Points: number; player2Points: number } {
  if (player1NetScore < player2NetScore) {
    return { player1Points: 1, player2Points: 0 };
  } else if (player2NetScore < player1NetScore) {
    return { player1Points: 0, player2Points: 1 };
  } else {
    return { player1Points: 0.5, player2Points: 0.5 };
  }
}

/**
 * Calculates Team Cup Day 3 results (Best Ball Team Matchplay + Score Bonus)
 * Returns:
 * - matchplayPoints: 6 for winner, 3 each for tie
 * - scoreBonusPoints: 3 for lowest cumulative, 1.5 each for tie
 */
export function calculateTeamCupDay3Points(
  team1HolesWon: number,
  team2HolesWon: number,
  team1CumulativeScore: number,
  team2CumulativeScore: number
): {
  team1MatchplayPoints: number;
  team2MatchplayPoints: number;
  team1ScoreBonusPoints: number;
  team2ScoreBonusPoints: number;
} {
  // Matchplay points
  let team1MatchplayPoints = 0;
  let team2MatchplayPoints = 0;

  if (team1HolesWon > team2HolesWon) {
    team1MatchplayPoints = 6;
    team2MatchplayPoints = 0;
  } else if (team2HolesWon > team1HolesWon) {
    team1MatchplayPoints = 0;
    team2MatchplayPoints = 6;
  } else {
    team1MatchplayPoints = 3;
    team2MatchplayPoints = 3;
  }

  // Score bonus points
  let team1ScoreBonusPoints = 0;
  let team2ScoreBonusPoints = 0;

  if (team1CumulativeScore < team2CumulativeScore) {
    team1ScoreBonusPoints = 3;
    team2ScoreBonusPoints = 0;
  } else if (team2CumulativeScore < team1CumulativeScore) {
    team1ScoreBonusPoints = 0;
    team2ScoreBonusPoints = 3;
  } else {
    team1ScoreBonusPoints = 1.5;
    team2ScoreBonusPoints = 1.5;
  }

  return {
    team1MatchplayPoints,
    team2MatchplayPoints,
    team1ScoreBonusPoints,
    team2ScoreBonusPoints,
  };
}
