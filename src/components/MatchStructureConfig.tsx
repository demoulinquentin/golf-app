import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Plus, Trash2, Users, AlertCircle, Edit2 } from "lucide-react";
import { useState } from "react";
import { MatchFormat } from "~/server/types/tournament";

interface MatchStructureConfigProps {
  roundIndex: number;
  segmentIndex: number;
  segmentNumber: number;
  totalPlayers: number;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  onStructureDefined: () => void;
}

interface MatchDefinition {
  id: string;
  sides: number; // Number of sides (2 for 1v1/2v2, 3 for three-way, etc.)
  playersPerSide: number; // Number of players on each side
  playerCount: number; // Total players in this match
}

export function MatchStructureConfig({
  roundIndex,
  segmentIndex,
  segmentNumber,
  totalPlayers,
  watch,
  setValue,
  onStructureDefined,
}: MatchStructureConfigProps) {
  const [matches, setMatches] = useState<MatchDefinition[]>([]);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customSides, setCustomSides] = useState(2);
  const [customPlayersPerSide, setCustomPlayersPerSide] = useState(1);
  
  const addMatch = (sides: number, playersPerSide: number) => {
    const newMatch: MatchDefinition = {
      id: `match-${Date.now()}`,
      sides,
      playersPerSide,
      playerCount: sides * playersPerSide,
    };
    setMatches([...matches, newMatch]);
    setShowCustomDialog(false);
  };
  
  const removeMatch = (id: string) => {
    setMatches(matches.filter(m => m.id !== id));
  };
  
  const totalPlayerSlots = matches.reduce((sum, m) => sum + m.playerCount, 0);
  const isValid = totalPlayerSlots === totalPlayers;
  const canProceed = isValid && matches.length > 0;
  
  const getMatchDescription = (match: MatchDefinition): string => {
    if (match.sides === 2 && match.playersPerSide === 1) {
      return "1v1 (Singles)";
    } else if (match.sides === 2 && match.playersPerSide === 2) {
      return "2v2 (Teams)";
    } else if (match.sides === 2 && match.playersPerSide === 3) {
      return "3v3 (Teams)";
    } else if (match.sides === 3 && match.playersPerSide === 1) {
      return "1v1v1 (Three-way)";
    } else if (match.sides === 2) {
      return `${match.playersPerSide}v${match.playersPerSide}`;
    } else {
      return `${match.sides} sides × ${match.playersPerSide} player${match.playersPerSide > 1 ? 's' : ''} each`;
    }
  };
  
  const handleConfirmStructure = () => {
    // Use FLEXIBLE format for all custom configurations
    const matchesArray = matches.map(() => ({
      sides: [] as number[][],
    }));
    
    const matchupFormat = {
      type: "flexible" as const,
      playerMatchup: {
        format: MatchFormat.FLEXIBLE,
        matches: matchesArray,
      },
    };
    
    // Store the match structure for PlayerMatchAssignment
    setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchStructure`, matches);
    setValue(`rounds.${roundIndex}.segments.${segmentIndex}.matchupFormat`, matchupFormat);
    
    onStructureDefined();
  };
  
  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900">
          Define Match Structure - Segment {segmentNumber}
        </h4>
        <p className="text-sm text-gray-600">
          Configure how players will be organized into matches
        </p>
      </div>
      
      {/* Quick Add Buttons */}
      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-gray-700">Quick Add:</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => addMatch(2, 1)}
            className="rounded-lg border-2 border-[#003d2e]/30 bg-white p-3 text-left transition-all hover:border-[#003d2e] hover:bg-[#e8f5e9]"
          >
            <p className="font-semibold text-gray-900">1v1</p>
            <p className="text-xs text-gray-600">2 players (singles)</p>
          </button>
          
          <button
            type="button"
            onClick={() => addMatch(2, 2)}
            className="rounded-lg border-2 border-[#003d2e]/30 bg-white p-3 text-left transition-all hover:border-[#003d2e] hover:bg-[#e8f5e9]"
          >
            <p className="font-semibold text-gray-900">2v2</p>
            <p className="text-xs text-gray-600">4 players (teams)</p>
          </button>
          
          <button
            type="button"
            onClick={() => addMatch(2, 3)}
            className="rounded-lg border-2 border-[#003d2e]/30 bg-white p-3 text-left transition-all hover:border-[#003d2e] hover:bg-[#e8f5e9]"
          >
            <p className="font-semibold text-gray-900">3v3</p>
            <p className="text-xs text-gray-600">6 players (teams)</p>
          </button>
          
          <button
            type="button"
            onClick={() => addMatch(3, 1)}
            className="rounded-lg border-2 border-[#003d2e]/30 bg-white p-3 text-left transition-all hover:border-[#003d2e] hover:bg-[#e8f5e9]"
          >
            <p className="font-semibold text-gray-900">1v1v1</p>
            <p className="text-xs text-gray-600">3 players (three-way)</p>
          </button>
        </div>
        
        <button
          type="button"
          onClick={() => setShowCustomDialog(true)}
          className="mt-2 w-full rounded-lg border-2 border-blue-400 bg-blue-50 p-3 text-left transition-all hover:border-blue-600 hover:bg-blue-100"
        >
          <p className="font-semibold text-blue-900">Custom Configuration</p>
          <p className="text-xs text-blue-700">Define your own match setup</p>
        </button>
      </div>
      
      {/* Custom Dialog */}
      {showCustomDialog && (
        <div className="mb-6 rounded-lg border-2 border-blue-300 bg-white p-4">
          <h5 className="mb-3 font-semibold text-gray-900">Custom Match Configuration</h5>
          
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Number of Sides
            </label>
            <input
              type="number"
              min="2"
              max="10"
              value={customSides}
              onChange={(e) => setCustomSides(parseInt(e.target.value) || 2)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-600">
              2 for head-to-head, 3 for three-way, etc.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Players Per Side
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={customPlayersPerSide}
              onChange={(e) => setCustomPlayersPerSide(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-600">
              Number of players on each side
            </p>
          </div>
          
          <div className="mb-4 rounded-lg bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-900">
              Total players in this match: {customSides * customPlayersPerSide}
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => addMatch(customSides, customPlayersPerSide)}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700"
            >
              Add Match
            </button>
            <button
              type="button"
              onClick={() => setShowCustomDialog(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Current Structure */}
      {matches.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-gray-700">Current Structure:</p>
          <div className="space-y-2">
            {matches.map((match, idx) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-lg bg-white p-4"
              >
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-[#003d2e]" />
                  <div>
                    <p className="font-semibold text-gray-900">
                      Match {idx + 1}: {getMatchDescription(match)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {match.playerCount} players total
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMatch(match.id)}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Validation Status */}
      <div className={`mb-4 rounded-lg p-4 ${
        totalPlayerSlots === 0
          ? "bg-gray-100"
          : isValid
          ? "bg-green-100"
          : "bg-yellow-100"
      }`}>
        <div className="flex items-start space-x-3">
          {totalPlayerSlots > 0 && !isValid && (
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`text-sm font-medium ${
              totalPlayerSlots === 0
                ? "text-gray-700"
                : isValid
                ? "text-green-900"
                : "text-yellow-900"
            }`}>
              Player Allocation: {totalPlayerSlots} / {totalPlayers}
            </p>
            {totalPlayerSlots > 0 && !isValid && (
              <p className="mt-1 text-xs text-yellow-800">
                {totalPlayerSlots < totalPlayers
                  ? `Add ${totalPlayers - totalPlayerSlots} more player slot(s) to match your tournament size`
                  : `Remove ${totalPlayerSlots - totalPlayers} player slot(s) - you have too many`
                }
              </p>
            )}
            {isValid && matches.length > 0 && (
              <p className="mt-1 text-xs text-green-800">
                ✓ Perfect! All {totalPlayers} players are assigned to matches
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Confirm Button */}
      <button
        type="button"
        onClick={handleConfirmStructure}
        disabled={!canProceed}
        className="w-full rounded-lg bg-[#003d2e] py-3 font-semibold text-[#fff8e7] shadow-lg hover:bg-[#00261c] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {canProceed ? "Confirm Structure & Assign Players" : "Configure Matches First"}
      </button>
    </div>
  );
}
