import { useState } from "react";
import { Upload, CheckCircle, XCircle, Info } from "lucide-react";
import toast from "react-hot-toast";

interface CourseJsonUploadProps {
  onJsonParsed: (jsonString: string, courseName: string, totalPar: number) => void;
  currentCourseName?: string;
}

export function CourseJsonUpload({ onJsonParsed, currentCourseName }: CourseJsonUploadProps) {
  const [fileName, setFileName] = useState<string>("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [parsedData, setParsedData] = useState<any>(null);
  const [showSample, setShowSample] = useState(false);

  const sampleJson = {
    courseName: "Sample Golf Course",
    holes: [
      { hole: 1, par: 4, strokeIndex: 10 },
      { hole: 2, par: 5, strokeIndex: 2 },
      { hole: 3, par: 3, strokeIndex: 16 },
      { hole: 4, par: 4, strokeIndex: 4 },
      { hole: 5, par: 4, strokeIndex: 12 },
      { hole: 6, par: 4, strokeIndex: 8 },
      { hole: 7, par: 3, strokeIndex: 18 },
      { hole: 8, par: 5, strokeIndex: 6 },
      { hole: 9, par: 4, strokeIndex: 14 },
      { hole: 10, par: 4, strokeIndex: 9 },
      { hole: 11, par: 5, strokeIndex: 1 },
      { hole: 12, par: 3, strokeIndex: 17 },
      { hole: 13, par: 4, strokeIndex: 3 },
      { hole: 14, par: 4, strokeIndex: 11 },
      { hole: 15, par: 4, strokeIndex: 7 },
      { hole: 16, par: 3, strokeIndex: 15 },
      { hole: 17, par: 5, strokeIndex: 5 },
      { hole: 18, par: 4, strokeIndex: 13 },
    ],
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsValid(null);
    setErrorMessage("");
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const parsed = JSON.parse(content);
        
        // Basic validation
        if (!parsed.courseName || typeof parsed.courseName !== "string") {
          throw new Error("Missing or invalid courseName field");
        }
        
        if (!Array.isArray(parsed.holes) || parsed.holes.length !== 18) {
          throw new Error("Must contain exactly 18 holes");
        }
        
        // Validate each hole
        const holeNumbers = new Set<number>();
        const strokeIndices = new Set<number>();
        
        for (const hole of parsed.holes) {
          if (typeof hole.hole !== "number" || hole.hole < 1 || hole.hole > 18) {
            throw new Error(`Invalid hole number: ${hole.hole}`);
          }
          if (holeNumbers.has(hole.hole)) {
            throw new Error(`Duplicate hole number: ${hole.hole}`);
          }
          holeNumbers.add(hole.hole);
          
          if (typeof hole.par !== "number" || hole.par < 3 || hole.par > 6) {
            throw new Error(`Invalid par for hole ${hole.hole}: ${hole.par}`);
          }
          
          if (typeof hole.strokeIndex !== "number" || hole.strokeIndex < 1 || hole.strokeIndex > 18) {
            throw new Error(`Invalid strokeIndex for hole ${hole.hole}: ${hole.strokeIndex}`);
          }
          if (strokeIndices.has(hole.strokeIndex)) {
            throw new Error(`Duplicate strokeIndex: ${hole.strokeIndex}`);
          }
          strokeIndices.add(hole.strokeIndex);
        }
        
        // Calculate total par
        const totalPar = parsed.holes.reduce((sum: number, hole: any) => sum + hole.par, 0);
        
        setIsValid(true);
        setParsedData(parsed);
        onJsonParsed(content, parsed.courseName, totalPar);
        toast.success("Course data loaded successfully!");
      } catch (error) {
        setIsValid(false);
        const message = error instanceof Error ? error.message : "Invalid JSON format";
        setErrorMessage(message);
        toast.error(message);
      }
    };
    
    reader.onerror = () => {
      setIsValid(false);
      setErrorMessage("Failed to read file");
      toast.error("Failed to read file");
    };
    
    reader.readAsText(file);
  };

  const downloadSample = () => {
    const blob = new Blob([JSON.stringify(sampleJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-course.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Sample file downloaded!");
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Course Data (JSON)
          <span className="ml-2 text-xs text-gray-500">(Optional)</span>
        </label>
        <p className="mb-3 text-sm text-gray-600">
          Upload a JSON file with hole information (par, stroke index) for accurate handicap calculations.
        </p>
        
        <div className="flex items-center space-x-3">
          <label className="flex-1 cursor-pointer">
            <div className={`flex items-center justify-center space-x-2 rounded-lg border-2 border-dashed p-6 transition-all ${
              isValid === true
                ? "border-green-500 bg-green-50"
                : isValid === false
                ? "border-red-500 bg-red-50"
                : "border-gray-300 hover:border-gray-400"
            }`}>
              {isValid === true ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : isValid === false ? (
                <XCircle className="h-6 w-6 text-red-600" />
              ) : (
                <Upload className="h-6 w-6 text-gray-400" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  {fileName || "Click to upload course JSON"}
                </p>
                {!fileName && (
                  <p className="text-xs text-gray-500">JSON file with 18 holes</p>
                )}
              </div>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          
          <button
            type="button"
            onClick={() => setShowSample(!showSample)}
            className="rounded-lg border border-gray-300 p-3 text-gray-600 hover:bg-gray-50"
            title="Show sample format"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Error: {errorMessage}</p>
        </div>
      )}

      {parsedData && isValid && (
        <div className="rounded-lg bg-green-50 p-4">
          <p className="mb-2 text-sm font-semibold text-green-900">
            ✓ Course Loaded: {parsedData.courseName}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-green-800">
            <div>Total Par: {parsedData.holes.reduce((sum: number, h: any) => sum + h.par, 0)}</div>
            <div>Holes: {parsedData.holes.length}</div>
          </div>
        </div>
      )}

      {showSample && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Sample JSON Format:</p>
            <button
              type="button"
              onClick={downloadSample}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Download Sample
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-green-400">
{`{
  "courseName": "Your Course Name",
  "holes": [
    { "hole": 1, "par": 4, "strokeIndex": 10 },
    { "hole": 2, "par": 5, "strokeIndex": 2 },
    ...
    { "hole": 18, "par": 4, "strokeIndex": 13 }
  ]
}`}
          </pre>
          <div className="mt-3 space-y-1 text-xs text-gray-600">
            <p>• <strong>hole</strong>: Hole number (1-18)</p>
            <p>• <strong>par</strong>: Par for the hole (3-6)</p>
            <p>• <strong>strokeIndex</strong>: Difficulty ranking (1-18, where 1 is hardest)</p>
          </div>
        </div>
      )}
    </div>
  );
}
