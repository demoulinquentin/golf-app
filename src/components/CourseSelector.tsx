import { PRELOADED_COURSES, courseToJson } from "~/data/courses";

interface CourseSelectorProps {
  onCourseSelected: (jsonString: string, courseName: string, totalPar: number) => void;
  currentCourseName?: string;
}

export function CourseSelector({ onCourseSelected, currentCourseName }: CourseSelectorProps) {
  const selectedId = currentCourseName
    ? PRELOADED_COURSES.find((c) => c.name === currentCourseName)?.id ?? ""
    : "";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const course = PRELOADED_COURSES.find((c) => c.id === e.target.value);
    if (!course) return;
    onCourseSelected(courseToJson(course), course.name, course.par);
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Course
      </label>
      <select
        value={selectedId}
        onChange={handleChange}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
      >
        <option value="" disabled>
          Select a course...
        </option>
        {PRELOADED_COURSES.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name} — Par {course.par}
          </option>
        ))}
      </select>
    </div>
  );
}
