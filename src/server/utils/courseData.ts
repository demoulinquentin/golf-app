import { z } from "zod";

// Schema for a single hole in the course JSON
export const holeSchema = z.object({
  hole: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  strokeIndex: z.number().int().min(1).max(18),
  yardage: z.number().int().positive().optional(),
});

// Schema for the complete course JSON
export const courseJsonSchema = z.object({
  courseName: z.string(),
  holes: z.array(holeSchema).length(18),
});

export type HoleData = z.infer<typeof holeSchema>;
export type CourseJson = z.infer<typeof courseJsonSchema>;

/**
 * Validates and parses course JSON data
 * @throws Error if validation fails
 */
export function validateCourseJson(jsonString: string): CourseJson {
  try {
    const parsed = JSON.parse(jsonString);
    const validated = courseJsonSchema.parse(parsed);
    
    // Additional validation: ensure all hole numbers 1-18 are present
    const holeNumbers = validated.holes.map(h => h.hole).sort((a, b) => a - b);
    const expectedHoles = Array.from({ length: 18 }, (_, i) => i + 1);
    
    if (JSON.stringify(holeNumbers) !== JSON.stringify(expectedHoles)) {
      throw new Error("Course must contain exactly holes 1-18 with no duplicates");
    }
    
    // Validate stroke indices are unique and 1-18
    const strokeIndices = validated.holes.map(h => h.strokeIndex).sort((a, b) => a - b);
    if (JSON.stringify(strokeIndices) !== JSON.stringify(expectedHoles)) {
      throw new Error("Stroke indices must be unique values from 1-18");
    }
    
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Invalid course JSON format: ${issues}`);
    }
    throw error;
  }
}

/**
 * Calculates how many strokes a player receives on a specific hole
 * based on their handicap and the hole's stroke index
 * 
 * @param playerHandicap - The player's handicap (e.g., 18)
 * @param strokeIndex - The hole's stroke index/difficulty (1-18, where 1 is hardest)
 * @returns Number of strokes the player receives on this hole (0, 1, or 2)
 */
export function calculateStrokesReceived(
  playerHandicap: number,
  strokeIndex: number
): number {
  // Round handicap to nearest integer for stroke allocation
  const roundedHandicap = Math.round(playerHandicap);
  
  if (roundedHandicap <= 0) {
    return 0;
  }
  
  // Player receives 1 stroke on holes where strokeIndex <= handicap
  if (strokeIndex <= roundedHandicap) {
    // If handicap > 18, player gets additional strokes
    if (roundedHandicap > 18 && strokeIndex <= (roundedHandicap - 18)) {
      return 2;
    }
    return 1;
  }
  
  return 0;
}

/**
 * Calculates the net score for a hole (gross strokes - handicap strokes)
 */
export function calculateNetScore(
  grossStrokes: number,
  playerHandicap: number,
  strokeIndex: number
): number {
  const strokesReceived = calculateStrokesReceived(playerHandicap, strokeIndex);
  return grossStrokes - strokesReceived;
}

/**
 * Generates a random alphanumeric join code
 * Format: 6-8 uppercase letters and numbers (e.g., "GOLF123", "TOUR2024")
 */
export function generateJoinCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters (I, O, 0, 1)
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Checks if a join code is available (not already used by another tournament)
 */
export async function isJoinCodeAvailable(code: string, db: any): Promise<boolean> {
  const existing = await db.tournament.findUnique({
    where: { joinCode: code },
  });
  return !existing;
}

/**
 * Generates a unique join code that doesn't exist in the database
 */
export async function generateUniqueJoinCode(db: any, maxAttempts: number = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateJoinCode(6);
    if (await isJoinCodeAvailable(code, db)) {
      return code;
    }
  }
  
  // If we couldn't find a unique 6-character code, try with 8 characters
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateJoinCode(8);
    if (await isJoinCodeAvailable(code, db)) {
      return code;
    }
  }
  
  throw new Error("Failed to generate unique join code");
}
