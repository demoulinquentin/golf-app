import { useState } from "react";
import { CheckCircle, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { PRELOADED_COURSES, courseToJson } from "~/data/courses";
import { CourseJsonUpload } from "./CourseJsonUpload";

interface CourseSelectorProps {
  onCourseSelected: (jsonString: string, courseName: string, totalPar: number) => void;
  currentCourseName?: string;
}

export function CourseSelector({ onCourseSelected, currentCourseName }: CourseSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (currentCourseName) {
      const match = PRELOADED_COURSES.find((c) => c.name === currentCourseName);
      return match ? match.id : null;
    }
    return null;
  });
  const [showCustom, setShowCustom] = useState(false);

  const handleSelect = (courseId: string) => {
    const course = PRELOADED_COURSES.find((c) => c.id === courseId);
    if (!course) return;

    setSelectedId(courseId);
    setShowCustom(false);
    onCourseSelected(courseToJson(course), course.name, course.par);
    toast.success(`${course.name} selected`);
  };

  const handleCustom = () => {
    setSelectedId(null);
    setShowCustom(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Select Course
        </label>
        <div className="grid gap-2">
          {PRELOADED_COURSES.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => handleSelect(course.id)}
              className={`flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all ${
                selectedId === course.id
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{course.name}</p>
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" />
                  {course.location} — Par {course.par}
                </p>
              </div>
              {selectedId === course.id && (
                <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={handleCustom}
            className={`rounded-lg border-2 border-dashed p-3 text-left transition-all ${
              showCustom
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <p className="text-sm font-medium text-gray-700">Custom course (upload JSON)</p>
            <p className="text-xs text-gray-500">Upload your own course data file</p>
          </button>
        </div>
      </div>

      {showCustom && (
        <CourseJsonUpload
          onJsonParsed={(json, courseName, totalPar) => {
            onCourseSelected(json, courseName, totalPar);
          }}
          currentCourseName={currentCourseName}
        />
      )}
    </div>
  );
}
