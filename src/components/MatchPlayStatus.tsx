import { Trophy, Minus } from "lucide-react";

interface MatchPlayStatusProps {
  player1Name: string;
  player2Name: string;
  player1Wins: number;
  player2Wins: number;
  holesRemaining: number;
}

export function MatchPlayStatus({
  player1Name,
  player2Name,
  player1Wins,
  player2Wins,
  holesRemaining,
}: MatchPlayStatusProps) {
  const difference = player1Wins - player2Wins;
  const isAllSquare = difference === 0;
  const isDormie = Math.abs(difference) === holesRemaining;
  const isMatchOver = Math.abs(difference) > holesRemaining;

  const getStatusText = () => {
    if (isMatchOver) {
      const winner = difference > 0 ? player1Name : player2Name;
      const margin = Math.abs(difference) - holesRemaining;
      return `${winner} wins ${margin}&${holesRemaining}`;
    }

    if (isDormie && !isAllSquare) {
      const leader = difference > 0 ? player1Name : player2Name;
      return `${leader} ${Math.abs(difference)} up (Dormie)`;
    }

    if (isAllSquare) {
      return "All Square";
    }

    const leader = difference > 0 ? player1Name : player2Name;
    return `${leader} ${Math.abs(difference)} up`;
  };

  const getStatusColor = () => {
    if (isMatchOver) return "bg-green-100 text-green-800 border-green-300";
    if (isDormie) return "bg-orange-100 text-orange-800 border-orange-300";
    if (isAllSquare) return "bg-gray-100 text-gray-800 border-gray-300";
    return "bg-blue-100 text-blue-800 border-blue-300";
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            {isMatchOver ? (
              <Trophy className="h-5 w-5" />
            ) : isAllSquare ? (
              <Minus className="h-5 w-5" />
            ) : null}
            <p className="font-bold text-lg">{getStatusText()}</p>
          </div>
          <div className="mt-2 flex items-center space-x-6 text-sm">
            <div>
              <p className="font-medium">{player1Name}</p>
              <p className="text-xs opacity-75">{player1Wins} holes won</p>
            </div>
            <div className="text-2xl font-bold opacity-50">vs</div>
            <div>
              <p className="font-medium">{player2Name}</p>
              <p className="text-xs opacity-75">{player2Wins} holes won</p>
            </div>
          </div>
        </div>
        {!isMatchOver && (
          <div className="text-right">
            <p className="text-sm font-medium opacity-75">Holes Remaining</p>
            <p className="text-3xl font-bold">{holesRemaining}</p>
          </div>
        )}
      </div>
    </div>
  );
}
