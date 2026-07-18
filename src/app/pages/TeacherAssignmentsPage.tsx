import { useState } from 'react';

import { AssignmentAuthoringForm } from '@/features/assignments/AssignmentAuthoringForm';
import {
  assignPublishedAssignment,
  createAssignmentDraft,
  publishAssignment,
} from '@/features/assignments/assignmentService';
import { useAuth } from '@/features/auth/authContext';
import { useClassroomStudents, useOwnedClassrooms } from '@/features/classrooms/useClassrooms';
import type { AssignmentDraft } from '@/lib/domain';

const WORKFLOW_ERROR = 'Unable to publish and assign this assignment. Please try again.';

export const TeacherAssignmentsPage = () => {
  const { user } = useAuth();
  const classrooms = useOwnedClassrooms(user?.uid ?? '');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const activeClassrooms = classrooms.data.filter((classroom) => classroom.status === 'active');
  const selectedClassroom =
    activeClassrooms.find((classroom) => classroom.id === selectedClassroomId) ?? null;
  const students = useClassroomStudents(selectedClassroom?.id ?? null);
  const activeStudents = students.data.filter((student) => student.status === 'active');
  const selectedActiveStudentIds = selectedStudentIds.filter((studentId) =>
    activeStudents.some((student) => student.id === studentId),
  );

  const selectClassroom = (classroomId: string) => {
    setSelectedClassroomId(classroomId);
    setSelectedStudentIds([]);
    setError(null);
    setSuccess(null);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((selectedId) => selectedId !== studentId)
        : [...current, studentId],
    );
    setError(null);
  };

  const publishAndAssign = async (draft: AssignmentDraft) => {
    if (isWorking || selectedClassroom === null || selectedActiveStudentIds.length === 0) {
      setError('Choose an active classroom and at least one active student before publishing.');
      return;
    }
    const studentCount = selectedActiveStudentIds.length;
    if (
      !window.confirm(
        `Publish “${draft.title}” and assign it to ${studentCount} active ${
          studentCount === 1 ? 'student' : 'students'
        }? Published questions cannot be edited in place.`,
      )
    ) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createAssignmentDraft({
        classroomId: selectedClassroom.id,
        draft,
      });
      await publishAssignment({
        assignmentId: created.assignment.id,
        classroomId: selectedClassroom.id,
        revisionId: created.revision.id,
      });
      const assigned = await assignPublishedAssignment({
        assignmentId: created.assignment.id,
        classroomId: selectedClassroom.id,
        studentIds: selectedActiveStudentIds,
      });
      setSuccess(
        `Published “${assigned.assignment.title}” and assigned it to ${studentCount} ${
          studentCount === 1 ? 'student' : 'students'
        }.`,
      );
    } catch {
      setError(WORKFLOW_ERROR);
    } finally {
      setIsWorking(false);
    }
  };

  const createAnother = () => {
    setSuccess(null);
    setError(null);
    setFormKey((current) => current + 1);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-md">
          <a className="font-semibold text-blue-700" href="/teacher">
            ← Return to teacher workspace
          </a>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-700">
            Teacher assignment workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold">Create and assign student work</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Choose the students first, review every question and approved hint, then explicitly
            confirm publication. Correct answers remain in the protected server key.
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-md">
          <h2 className="text-xl font-bold">1. Choose recipients</h2>
          {classrooms.isLoading ? (
            <p role="status" className="mt-4 text-slate-600">
              Loading active classrooms…
            </p>
          ) : classrooms.error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
              {classrooms.error}
            </p>
          ) : activeClassrooms.length === 0 ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">
              Create an active classroom before authoring an assignment.
            </p>
          ) : (
            <label className="mt-4 block max-w-lg font-semibold text-slate-800">
              Active classroom
              <select
                value={selectedClassroomId}
                onChange={(event) => selectClassroom(event.target.value)}
                disabled={isWorking}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Choose a classroom</option>
                {activeClassrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedClassroom && students.isLoading && (
            <p role="status" className="mt-4 text-slate-600">
              Loading students…
            </p>
          )}
          {selectedClassroom && students.error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
              {students.error}
            </p>
          )}
          {selectedClassroom && !students.isLoading && !students.error && (
            <fieldset className="mt-5">
              <legend className="font-semibold text-slate-800">Students</legend>
              {students.data.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">This classroom has no students yet.</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {students.data.map((student) => {
                    const isActive = student.status === 'active';
                    const checkboxId = `assignment-student-${student.id}`;
                    return (
                      <li key={student.id}>
                        <div
                          className={`flex items-center gap-3 rounded-xl border p-3 ${
                            isActive ? 'border-slate-200' : 'border-slate-100 bg-slate-50'
                          }`}
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            aria-label={`${student.displayName} (${student.status})`}
                            checked={isActive && selectedStudentIds.includes(student.id)}
                            onChange={() => toggleStudent(student.id)}
                            disabled={isWorking || !isActive}
                          />
                          <span>
                            <span className="block font-semibold">{student.displayName}</span>
                            <span className="block text-xs capitalize text-slate-500">
                              {student.status}
                            </span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {activeStudents.length === 0 && students.data.length > 0 && (
                <p className="mt-3 text-sm text-amber-800">
                  This classroom has no active students available for assignment.
                </p>
              )}
            </fieldset>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 font-medium text-red-700">
            {error}
          </p>
        )}

        {success ? (
          <section className="rounded-2xl bg-emerald-50 p-6 shadow-md">
            <h2 className="text-2xl font-bold text-emerald-950">Assignment ready</h2>
            <p role="status" className="mt-3 text-emerald-900">
              {success}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={createAnother}
                className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white"
              >
                Create another assignment
              </button>
              <a
                className="rounded-lg border border-emerald-800 px-4 py-2 font-semibold"
                href="/teacher"
              >
                Return to workspace
              </a>
            </div>
          </section>
        ) : selectedClassroom && selectedActiveStudentIds.length > 0 ? (
          <section aria-labelledby="authoring-heading">
            <h2 id="authoring-heading" className="sr-only">
              2. Author and review
            </h2>
            {isWorking && (
              <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 font-medium text-blue-900">
                Publishing the protected assignment and assigning students…
              </p>
            )}
            <AssignmentAuthoringForm
              key={formKey}
              isSaving={isWorking}
              onPublish={(draft) => void publishAndAssign(draft)}
            />
          </section>
        ) : selectedClassroom && activeStudents.length > 0 ? (
          <p role="status" className="rounded-2xl bg-white p-6 shadow-md text-slate-600">
            Select at least one active student to begin authoring.
          </p>
        ) : null}
      </div>
    </main>
  );
};
