import { UseFormRegister, UseFormWatch, UseFormSetValue } from "react-hook-form";
import { GameType, MatchFormat, PlayerMatchup } from "~/server/types/tournament";
import { Info, Users, UserPlus } from "lucide-react";
import { useState } from "react";
import { MatchStructureConfig } from "~/components/MatchStructureConfig";
import { PlayerMatchAssignment } from "~/components/PlayerMatchAssignment";

interface SegmentConfigFormProps {
  roundIndex: number;
  segmentIndex: number;
  segmentNumber: number;
  holes: number[];
  playerCount: number;
  players: Array<{ name: string; handicap: number }>;
  globalTeams?: Array<{ name: string; color: string; playerIndices: number[] }>;
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

export function SegmentConfigForm({
  roundIndex,
  segmentIndex,
  segmentNumber,
  holes,
  playerCount,
  players,
  globalTeams,
  register,
  watch,
  setValue,
}: SegmentConfigFormProps) {
  const gameType = watch(`rounds.${roundIndex}.segments.${segmentIndex}.gameType`);
  const matchupFormat = watch(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [configStep, setConfigStep] = useState<"format" | "structure" | "assignment">("format");
  const [matchStructureDefined, setMatchStructureDefined] = useState(false);
  const matchStructure = watch(`rounds.${roundIndex}.segments.${segmentIndex}.matchStructure`);

  // Helper to get player's team
  const getPlayerTeam = (playerIndex: number) => {
    if (!globalTeams) return null;
    return globalTeams.find(team => team.playerIndices.includes(playerIndex));
  };

  // Helper to get team color
  const getTeamColor = (playerIndex: number) => {
    const team = getPlayerTeam(playerIndex);
    return team?.color || "#6366f1";
  };

  const setRyderCupFormat = (format: MatchFormat) => {
    if (format === MatchFormat.INDIVIDUAL) {
      setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, {
        type: "flexible",
        playerMatchup: {
          format: MatchFormat.INDIVIDUAL,
          playerIndices: Array.from({ length: playerCount }, (_, i) => i),
        },
      });
    } else if (format === MatchFormat.FOURSOMES || format === MatchFormat.FOURBALL) {
      // Default: create one 2v2 match with first 4 players from teams if available
      const team1Players = globalTeams?.[0]?.playerIndices.slice(0, 2) || [0, 1];
      const team2Players = globalTeams?.[1]?.playerIndices.slice(0, 2) || [2, 3];
      
      setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, {
        type: "flexible",
        playerMatchup: {
          format: MatchFormat.FLEXIBLE,
          matches: [{
            sides: [
              [team1Players[0] || 0, team1Players[1] || 1],
              [team2Players[0] || 2, team2Players[1] || 3],
            ],
          }],
        },
      });
      
      // Store the match structure for PlayerMatchAssignment
      setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchStructure`, [{
        id: `match-${Date.now()}`,
        sides: 2,
        playersPerSide: 2,
        playerCount: 4,
      }]);
    } else if (format === MatchFormat.SINGLES) {
      // Default: create 1v1 matches pairing players from different teams
      const team1Players = globalTeams?.[0]?.playerIndices || [];
      const team2Players = globalTeams?.[1]?.playerIndices || [];
      const matches = [];
      const matchStructure = [];
      
      const matchCount = Math.min(team1Players.length, team2Players.length);
      for (let i = 0; i < matchCount; i++) {
        matches.push({
          sides: [
            [team1Players[i]],
            [team2Players[i]],
          ],
        });
        matchStructure.push({
          id: `match-${Date.now()}-${i}`,
          sides: 2,
          playersPerSide: 1,
          playerCount: 2,
        });
      }
      
      setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, {
        type: "flexible",
        playerMatchup: {
          format: MatchFormat.FLEXIBLE,
          matches: matches.length > 0 ? matches : [{ sides: [[0], [1]] }],
        },
      });
      
      // Store the match structure for PlayerMatchAssignment
      setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchStructure`, 
        matchStructure.length > 0 ? matchStructure : [{
          id: `match-${Date.now()}`,
          sides: 2,
          playersPerSide: 1,
          playerCount: 2,
        }]
      );
    }
  };

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900">
          Segment {segmentNumber} - Holes {holes[0]}-{holes[holes.length - 1]}
        </h4>
        <p className="text-sm text-gray-600">{holes.length} holes</p>
      </div>

      {/* Game Type Selection */}
      <div className="mb-6">
        <label className="mb-3 block text-sm font-medium text-gray-700">
          Game Type
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label
            className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
              gameType === GameType.SCRAMBLE
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              value={GameType.SCRAMBLE}
              {...register(`rounds.${roundIndex}.segments.${segmentIndex}.gameType`)}
              className="sr-only"
            />
            <div className="text-center">
              <p className="font-semibold text-gray-900">Scramble</p>
              <p className="text-xs text-gray-600">Team plays from best shot</p>
            </div>
          </label>

          <label
            className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
              gameType === GameType.STROKE_PLAY
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              value={GameType.STROKE_PLAY}
              {...register(`rounds.${roundIndex}.segments.${segmentIndex}.gameType`)}
              className="sr-only"
            />
            <div className="text-center">
              <p className="font-semibold text-gray-900">Stroke Play</p>
              <p className="text-xs text-gray-600">Lowest total score wins</p>
            </div>
          </label>

          <label
            className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
              gameType === GameType.STABLEFORD
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              value={GameType.STABLEFORD}
              {...register(`rounds.${roundIndex}.segments.${segmentIndex}.gameType`)}
              className="sr-only"
            />
            <div className="text-center">
              <p className="font-semibold text-gray-900">Stableford</p>
              <p className="text-xs text-gray-600">Points based on score</p>
            </div>
          </label>
        </div>
      </div>

      {/* Match Format Selection */}
      <div className="mb-6">
        <label className="mb-3 block text-sm font-medium text-gray-700">
          Match Format
        </label>
        
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Foursomes */}
          <button
            type="button"
            onClick={() => {
              setRyderCupFormat(MatchFormat.FOURSOMES);
              setMatchStructureDefined(true);
              setConfigStep("assignment");
            }}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              matchupFormat?.type === "flexible" && matchupFormat.playerMatchup?.format === MatchFormat.FOURSOMES
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-semibold text-gray-900">Foursomes</p>
            <p className="text-xs text-gray-600">Alternate shot - 2v2</p>
          </button>

          {/* Fourball */}
          <button
            type="button"
            onClick={() => {
              setRyderCupFormat(MatchFormat.FOURBALL);
              setMatchStructureDefined(true);
              setConfigStep("assignment");
            }}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              matchupFormat?.type === "flexible" && matchupFormat.playerMatchup?.format === MatchFormat.FOURBALL
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-semibold text-gray-900">Fourball</p>
            <p className="text-xs text-gray-600">Best ball - 2v2</p>
          </button>

          {/* Singles */}
          <button
            type="button"
            onClick={() => {
              setRyderCupFormat(MatchFormat.SINGLES);
              setMatchStructureDefined(true);
              setConfigStep("assignment");
            }}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              matchupFormat?.type === "flexible" && matchupFormat.playerMatchup?.format === MatchFormat.SINGLES
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-semibold text-gray-900">Singles</p>
            <p className="text-xs text-gray-600">1v1 matches</p>
          </button>

          {/* Individual */}
          <button
            type="button"
            onClick={() => {
              setRyderCupFormat(MatchFormat.INDIVIDUAL);
              setConfigStep("format");
              setMatchStructureDefined(false);
            }}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              matchupFormat?.type === "individual" || 
              (matchupFormat?.type === "flexible" && matchupFormat.playerMatchup?.format === MatchFormat.INDIVIDUAL)
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-semibold text-gray-900">Individual</p>
            <p className="text-xs text-gray-600">Every player for themselves</p>
          </button>

          {/* Legacy 2v2 */}
          {playerCount === 4 && (
            <button
              type="button"
              onClick={() => {
                setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, {
                  type: "2v2",
                  teams: [[0, 1], [2, 3]],
                });
                setConfigStep("format");
                setMatchStructureDefined(false);
              }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                matchupFormat?.type === "2v2"
                  ? "border-purple-600 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="font-semibold text-gray-900">2v2 Team</p>
              <p className="text-xs text-gray-600">Two teams of two</p>
            </button>
          )}

          {/* Legacy 1v1+1v1 */}
          {playerCount === 4 && (
            <button
              type="button"
              onClick={() => {
                setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, {
                  type: "1v1+1v1",
                  pairs: [[0, 1], [2, 3]],
                });
                setConfigStep("format");
                setMatchStructureDefined(false);
              }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                matchupFormat?.type === "1v1+1v1"
                  ? "border-purple-600 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="font-semibold text-gray-900">1v1 + 1v1</p>
              <p className="text-xs text-gray-600">Two separate matches</p>
            </button>
          )}

          {/* Custom Match Structure Button */}
          <button
            type="button"
            onClick={() => {
              setConfigStep("structure");
              setMatchStructureDefined(false);
            }}
            className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 text-left transition-all hover:border-blue-600 hover:bg-blue-100"
          >
            <p className="font-semibold text-blue-900">Custom Structure</p>
            <p className="text-xs text-blue-700">Define your own match setup</p>
          </button>
        </div>
      </div>

      {/* Match Structure Configuration */}
      {configStep === "structure" && !matchStructureDefined && (
        <div className="mt-6">
          <MatchStructureConfig
            roundIndex={roundIndex}
            segmentIndex={segmentIndex}
            segmentNumber={segmentNumber}
            totalPlayers={playerCount}
            watch={watch}
            setValue={setValue}
            onStructureDefined={() => {
              setMatchStructureDefined(true);
              setConfigStep("assignment");
            }}
          />
        </div>
      )}

      {/* Player Assignment */}
      {configStep === "assignment" && matchStructureDefined && matchStructure && (
        <div className="mt-6">
          <PlayerMatchAssignment
            roundIndex={roundIndex}
            segmentIndex={segmentIndex}
            segmentNumber={segmentNumber}
            players={players}
            matchStructure={matchStructure}
            globalTeams={globalTeams}
            watch={watch}
            setValue={setValue}
            onComplete={() => {
              setShowAdvancedConfig(true);
              setConfigStep("format");
            }}
          />
        </div>
      )}

      {/* Advanced Configuration for flexible formats */}
      {showAdvancedConfig && matchupFormat?.type === "flexible" && matchupFormat.playerMatchup && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <h5 className="font-semibold text-blue-900">Match Configuration</h5>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setConfigStep("structure");
                  setMatchStructureDefined(false);
                  setShowAdvancedConfig(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Edit Matches
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedConfig(false)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Hide
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Display current matches for FLEXIBLE format */}
            {matchupFormat.playerMatchup.format === MatchFormat.FLEXIBLE && (
              <div className="space-y-2">
                {(matchupFormat.playerMatchup.matches || []).map((match: any, matchIdx: number) => (
                  <div key={matchIdx} className="rounded-lg bg-white p-3">
                    <p className="mb-2 text-sm font-medium text-gray-700">Match {matchIdx + 1}</p>
                    <div className={`grid gap-2 ${match.sides?.length === 2 ? 'grid-cols-2' : match.sides?.length === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                      {(match.sides || []).map((side: number[], sideIdx: number) => (
                        <div key={sideIdx}>
                          <p className="mb-1 text-xs font-medium text-gray-600">Side {sideIdx + 1}</p>
                          {side.map((playerIdx: number) => (
                            <div key={playerIdx} className="flex items-center space-x-2 text-sm">
                              <div 
                                className="h-3 w-3 rounded-full" 
                                style={{ backgroundColor: getTeamColor(playerIdx) }}
                              />
                              <span>{players[playerIdx]?.name || `Player ${playerIdx + 1}`}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Keep existing display for FOURSOMES, FOURBALL, SINGLES */}
            {(matchupFormat.playerMatchup.format === MatchFormat.FOURSOMES || 
              matchupFormat.playerMatchup.format === MatchFormat.FOURBALL) && (
              <div className="space-y-2">
                {(matchupFormat.playerMatchup.matches || []).map((match: any, matchIdx: number) => (
                  <div key={matchIdx} className="rounded-lg bg-white p-3">
                    <p className="mb-2 text-sm font-medium text-gray-700">Match {matchIdx + 1}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="mb-1 text-xs font-medium text-gray-600">Team 1</p>
                        {(match.team1PlayerIndices || []).map((idx: number) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: getTeamColor(idx) }}
                            />
                            <span>{players[idx]?.name || `Player ${idx + 1}`}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-gray-600">Team 2</p>
                        {(match.team2PlayerIndices || []).map((idx: number) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: getTeamColor(idx) }}
                            />
                            <span>{players[idx]?.name || `Player ${idx + 1}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {matchupFormat.playerMatchup.format === MatchFormat.SINGLES && (
              <div className="space-y-2">
                {(matchupFormat.playerMatchup.matches || []).map((match: any, matchIdx: number) => (
                  <div key={matchIdx} className="rounded-lg bg-white p-3">
                    <p className="mb-2 text-sm font-medium text-gray-700">Match {matchIdx + 1}</p>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: getTeamColor(match.player1Index ?? 0) }}
                        />
                        <span>{players[match.player1Index]?.name || `Player ${(match.player1Index ?? 0) + 1}`}</span>
                      </div>
                      <span className="text-gray-400">vs</span>
                      <div className="flex items-center space-x-2">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: getTeamColor(match.player2Index ?? 0) }}
                        />
                        <span>{players[match.player2Index]?.name || `Player ${(match.player2Index ?? 0) + 1}`}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show player roster with team colors */}
      {globalTeams && globalTeams.length > 0 && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Player Roster</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {players.map((player, idx) => {
              const team = getPlayerTeam(idx);
              return (
                <div key={idx} className="flex items-center space-x-2 text-sm">
                  <div 
                    className="h-3 w-3 rounded-full" 
                    style={{ backgroundColor: team?.color || "#6366f1" }}
                  />
                  <span className="font-medium">{player.name}</span>
                  {team && (
                    <span className="text-xs text-gray-500">({team.name})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation warning for Scramble + Individual */}
      {gameType === GameType.SCRAMBLE && 
       (matchupFormat?.type === "individual" || 
        (matchupFormat?.type === "flexible" && matchupFormat.playerMatchup?.format === MatchFormat.INDIVIDUAL)) && (
        <div className="mt-4 rounded-lg bg-red-50 p-4">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-medium">Invalid configuration</p>
              <p className="mt-1 text-red-800">
                Scramble format requires team play. Please select a team-based match format.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
