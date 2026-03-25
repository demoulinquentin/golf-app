import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Users, Check, X } from "lucide-react";
import { useState } from "react";
import { MatchFormat } from "~/server/types/tournament";

interface PlayerMatchAssignmentProps {
  roundIndex: number;
  segmentIndex: number;
  segmentNumber: number;
  players: Array<{ name: string; handicap: number }>;
  matchStructure: Array<{ 
    id: string; 
    sides: number; 
    playersPerSide: number; 
    playerCount: number;
  }>;
  globalTeams?: Array<{ name: string; color: string; playerIndices: number[] }>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  onComplete: () => void;
}

interface PlayerSlot {
  matchIndex: number;
  sideIndex: number; // Which side (0, 1, 2, etc.)
  slotIndex: number; // Position within that side
  playerIndex: number | null;
}

export function PlayerMatchAssignment({
  roundIndex,
  segmentIndex,
  segmentNumber,
  players,
  matchStructure,
  globalTeams,
  watch,
  setValue,
  onComplete,
}: PlayerMatchAssignmentProps) {
  // Initialize slots based on match structure
  const initializeSlots = (): PlayerSlot[] => {
    const slots: PlayerSlot[] = [];
    matchStructure.forEach((match, matchIndex) => {
      // Create slots for each side
      for (let sideIndex = 0; sideIndex < match.sides; sideIndex++) {
        for (let slotIndex = 0; slotIndex < match.playersPerSide; slotIndex++) {
          slots.push({ 
            matchIndex, 
            sideIndex, 
            slotIndex, 
            playerIndex: null 
          });
        }
      }
    });
    return slots;
  };
  
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>(initializeSlots());
  const [selectedSlot, setSelectedSlot] = useState<{ matchIndex: number; slotIndex: number } | null>(null);
  
  const getPlayerTeam = (playerIndex: number) => {
    if (!globalTeams) return null;
    return globalTeams.find(team => team.playerIndices.includes(playerIndex));
  };
  
  const getTeamColor = (playerIndex: number) => {
    const team = getPlayerTeam(playerIndex);
    return team?.color || "#6366f1";
  };
  
  const assignPlayerToSlot = (playerIndex: number) => {
    if (!selectedSlot) return;
    
    // Check if player is already assigned in this segment
    const isAlreadyAssigned = playerSlots.some(
      slot => slot.playerIndex === playerIndex
    );
    
    if (isAlreadyAssigned) {
      // Remove player from their current slot
      setPlayerSlots(playerSlots.map(slot => 
        slot.playerIndex === playerIndex ? { ...slot, playerIndex: null } : slot
      ));
    }
    
    // Assign player to selected slot
    const match = matchStructure[selectedSlot.matchIndex];
    const sideIndex = Math.floor(selectedSlot.slotIndex / match.playersPerSide);
    const positionInSide = selectedSlot.slotIndex % match.playersPerSide;
    
    setPlayerSlots(playerSlots.map(slot =>
      slot.matchIndex === selectedSlot.matchIndex && 
      slot.sideIndex === sideIndex && 
      slot.slotIndex === positionInSide
        ? { ...slot, playerIndex }
        : slot
    ));
    
    setSelectedSlot(null);
  };
  
  const clearSlot = (matchIndex: number, slotIndex: number) => {
    setPlayerSlots(playerSlots.map(slot => {
      const match = matchStructure[matchIndex];
      const sideIndex = Math.floor(slotIndex / match.playersPerSide);
      const positionInSide = slotIndex % match.playersPerSide;
      
      return slot.matchIndex === matchIndex && 
             slot.sideIndex === sideIndex && 
             slot.slotIndex === positionInSide
        ? { ...slot, playerIndex: null }
        : slot;
    }));
  };
  
  const getAssignedPlayers = (): Set<number> => {
    return new Set(playerSlots.filter(s => s.playerIndex !== null).map(s => s.playerIndex!));
  };
  
  const isComplete = playerSlots.every(slot => slot.playerIndex !== null);
  
  const handleConfirm = () => {
    // Build the matches array with sides for FLEXIBLE format
    const matches: any[] = [];
    
    matchStructure.forEach((match, matchIndex) => {
      const matchSlots = playerSlots.filter(s => s.matchIndex === matchIndex);
      const sides: number[][] = [];
      
      // Group slots by side
      for (let sideIndex = 0; sideIndex < match.sides; sideIndex++) {
        const sidePlayerIndices = matchSlots
          .filter(s => s.sideIndex === sideIndex)
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map(s => s.playerIndex ?? 0);
        sides.push(sidePlayerIndices);
      }
      
      matches.push({ sides });
    });
    
    const matchupFormat = {
      type: "flexible" as const,
      playerMatchup: {
        format: MatchFormat.FLEXIBLE,
        matches,
      },
    };
    
    setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, matchupFormat);
    onComplete();
  };
  
  const assignedPlayers = getAssignedPlayers();
  
  return (
    <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900">
          Assign Players - Segment {segmentNumber}
        </h4>
        <p className="text-sm text-gray-600">
          Click a slot, then click a player to assign them
        </p>
      </div>
      
      {/* Match Slots */}
      <div className="mb-6 space-y-4">
        {matchStructure.map((match, matchIndex) => {
          const matchSlots = playerSlots.filter(s => s.matchIndex === matchIndex);
          
          // Get side label
          const getSideLabel = (sideIndex: number) => {
            if (match.sides === 2) {
              return sideIndex === 0 ? "Side 1" : "Side 2";
            } else {
              return `Side ${sideIndex + 1}`;
            }
          };
          
          // Get match description
          const getMatchDescription = () => {
            if (match.sides === 2 && match.playersPerSide === 1) {
              return "1v1 Match";
            } else if (match.sides === 2 && match.playersPerSide === 2) {
              return "2v2 Match";
            } else if (match.sides === 2 && match.playersPerSide === 3) {
              return "3v3 Match";
            } else if (match.sides === 3 && match.playersPerSide === 1) {
              return "1v1v1 Match";
            } else if (match.sides === 2) {
              return `${match.playersPerSide}v${match.playersPerSide} Match`;
            } else {
              return `${match.sides}-way Match`;
            }
          };
          
          return (
            <div key={match.id} className="rounded-lg bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-gray-900">
                Match {matchIndex + 1}: {getMatchDescription()}
              </p>
              
              <div className={`grid gap-4 ${match.sides === 2 ? 'grid-cols-2' : match.sides === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {Array.from({ length: match.sides }, (_, sideIndex) => {
                  const sideSlots = matchSlots.filter(s => s.sideIndex === sideIndex);
                  
                  return (
                    <div key={sideIndex}>
                      <p className="mb-2 text-xs font-medium text-gray-600">{getSideLabel(sideIndex)}</p>
                      <div className="space-y-2">
                        {sideSlots.map((slot) => (
                          <div
                            key={`${slot.sideIndex}-${slot.slotIndex}`}
                            onClick={() => setSelectedSlot({ matchIndex, slotIndex: slot.sideIndex * match.playersPerSide + slot.slotIndex })}
                            className={`relative w-full rounded-lg border-2 p-3 text-left transition-all cursor-pointer ${
                              selectedSlot?.matchIndex === matchIndex && 
                              selectedSlot?.slotIndex === slot.sideIndex * match.playersPerSide + slot.slotIndex
                                ? "border-green-600 bg-green-100"
                                : slot.playerIndex !== null
                                ? "border-purple-300 bg-purple-50"
                                : "border-gray-300 bg-gray-50 hover:border-gray-400"
                            }`}
                          >
                            {slot.playerIndex !== null ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: getTeamColor(slot.playerIndex) }}
                                  />
                                  <span className="text-sm font-medium">
                                    {players[slot.playerIndex]?.name}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearSlot(matchIndex, slot.sideIndex * match.playersPerSide + slot.slotIndex);
                                  }}
                                  className="rounded p-1 hover:bg-red-100"
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">
                                {match.playersPerSide > 1 
                                  ? `Player ${slot.slotIndex + 1} - Click to assign`
                                  : "Click to assign"
                                }
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Available Players */}
      {selectedSlot !== null && (
        <div className="mb-6 rounded-lg bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-gray-900">
            Select a player to assign:
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((player, playerIndex) => {
              const isAssigned = assignedPlayers.has(playerIndex);
              const team = getPlayerTeam(playerIndex);
              
              return (
                <button
                  key={playerIndex}
                  type="button"
                  onClick={() => assignPlayerToSlot(playerIndex)}
                  disabled={isAssigned && playerSlots.find(s => s.playerIndex === playerIndex)?.matchIndex !== selectedSlot.matchIndex}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${
                    isAssigned
                      ? "border-gray-300 bg-gray-100 opacity-50"
                      : "border-purple-300 bg-white hover:border-purple-500 hover:bg-purple-50"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getTeamColor(playerIndex) }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{player.name}</p>
                      {team && (
                        <p className="text-xs text-gray-600">({team.name})</p>
                      )}
                    </div>
                    {isAssigned && <Check className="h-4 w-4 text-green-600" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Confirm Button */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!isComplete}
        className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 py-3 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isComplete ? "Confirm Player Assignments" : `Assign ${playerSlots.filter(s => s.playerIndex === null).length} More Player(s)`}
      </button>
    </div>
  );
}
