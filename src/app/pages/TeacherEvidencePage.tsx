import { useRef, useState } from 'react';

import { useAuth } from '@/features/auth/authContext';
import { useClassroomStudents, useOwnedClassrooms } from '@/features/classrooms/useClassrooms';
import { SessionEvidenceDetail } from '@/features/teacher-evidence/SessionEvidenceDetail';
import {
  listTeacherStudentSessions,
  loadTeacherSessionEvidence,
  type TeacherSessionEvidence,
  type TeacherSessionSummary,
} from '@/features/teacher-evidence/teacherEvidenceService';

const formatDate = (value: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);

export const TeacherEvidencePage = () => {
  const { user } = useAuth();
  const classrooms = useOwnedClassrooms(user?.uid ?? '');
  const [classroomId, setClassroomId] = useState('');
  const [studentId, setStudentId] = useState('');
  const students = useClassroomStudents(classroomId || null);
  const [sessions, setSessions] = useState<readonly TeacherSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [evidence, setEvidence] = useState<TeacherSessionEvidence | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRequestId = useRef(0);

  const chooseClassroom = (nextClassroomId: string) => {
    sessionRequestId.current += 1;
    setClassroomId(nextClassroomId);
    setStudentId('');
    setSessions([]);
    setSelectedSessionId('');
    setEvidence(null);
    setError(null);
    setIsLoadingSessions(false);
  };

  const chooseStudent = async (nextStudentId: string) => {
    const requestId = sessionRequestId.current + 1;
    sessionRequestId.current = requestId;
    setStudentId(nextStudentId);
    setSessions([]);
    setSelectedSessionId('');
    setEvidence(null);
    setError(null);
    if (!user?.uid || !classroomId || !nextStudentId) {
      setIsLoadingSessions(false);
      return;
    }

    setIsLoadingSessions(true);
    try {
      const nextSessions = await listTeacherStudentSessions({
        classroomId,
        studentId: nextStudentId,
        teacherId: user.uid,
      });
      if (sessionRequestId.current === requestId) setSessions(nextSessions);
    } catch (caught) {
      if (sessionRequestId.current === requestId) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load this student’s recorded work. Please try again.',
        );
      }
    } finally {
      if (sessionRequestId.current === requestId) setIsLoadingSessions(false);
    }
  };

  const selectSession = async (sessionId: string) => {
    if (!user?.uid || !classroomId || !studentId || isLoadingEvidence) return;
    setSelectedSessionId(sessionId);
    setEvidence(null);
    setError(null);
    setIsLoadingEvidence(true);
    try {
      setEvidence(
        await loadTeacherSessionEvidence({
          classroomId,
          sessionId,
          studentId,
          teacherId: user.uid,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load this student’s recorded work. Please try again.',
      );
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  const activeClassrooms = classrooms.data.filter(({ status }) => status === 'active');
  const selectedStudent = students.data.find(({ id }) => id === studentId);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-md">
          <a
            className="inline-flex min-h-11 items-center font-semibold text-blue-700"
            href="/teacher"
          >
            ← Return to teacher workspace
          </a>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-700">
            Teacher evidence workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold">Review recorded student work</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Inspect submitted responses, attempt timing, outcomes, and support-use events. Answer
            keys remain protected and this view cannot change the student record.
          </p>
        </header>

        <section
          className="rounded-2xl bg-white p-6 shadow-md"
          aria-labelledby="choose-student-heading"
        >
          <h2 id="choose-student-heading" className="text-xl font-bold">
            Choose a student
          </h2>
          {classrooms.isLoading ? (
            <p role="status" className="mt-4 text-slate-600">
              Loading classrooms…
            </p>
          ) : classrooms.error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">
              {classrooms.error}
            </p>
          ) : activeClassrooms.length === 0 ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">
              No active classroom is available.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="font-semibold">
                Active classroom
                <select
                  value={classroomId}
                  onChange={(event) => chooseClassroom(event.target.value)}
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
              <label className="font-semibold">
                Student
                <select
                  value={studentId}
                  onChange={(event) => void chooseStudent(event.target.value)}
                  disabled={!classroomId || students.isLoading || Boolean(students.error)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                >
                  <option value="">Choose a student</option>
                  {students.data.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {classroomId && students.isLoading && (
            <p role="status" className="mt-3 text-slate-600">
              Loading students…
            </p>
          )}
          {students.error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">
              {students.error}
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 font-medium text-red-700">
            {error}
          </p>
        )}
        {isLoadingSessions && (
          <p role="status" className="rounded-2xl bg-white p-6 shadow-md text-slate-600">
            Loading recorded sessions…
          </p>
        )}
        {studentId && !isLoadingSessions && !error && sessions.length === 0 && (
          <p role="status" className="rounded-2xl bg-white p-6 shadow-md text-slate-600">
            No recorded sessions are available for {selectedStudent?.displayName ?? 'this student'}{' '}
            yet.
          </p>
        )}
        {sessions.length > 0 && (
          <section
            className="rounded-2xl bg-white p-6 shadow-md"
            aria-labelledby="sessions-heading"
          >
            <h2 id="sessions-heading" className="text-xl font-bold">
              Recent sessions
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Up to the 20 most recently updated sessions are shown.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {sessions.map(({ assignmentTitle, session }) => (
                <li key={session.id}>
                  <button
                    type="button"
                    aria-pressed={selectedSessionId === session.id}
                    onClick={() => void selectSession(session.id)}
                    disabled={isLoadingEvidence}
                    className="min-h-11 w-full rounded-xl border border-slate-300 p-4 text-left hover:bg-slate-50 aria-pressed:border-indigo-700 aria-pressed:bg-indigo-50 disabled:opacity-60"
                  >
                    <span className="block font-bold">{assignmentTitle}</span>
                    <span className="mt-1 block text-sm capitalize text-slate-600">
                      {session.status.replace(/([A-Z])/g, ' $1')} · {formatDate(session.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {isLoadingEvidence && (
          <p role="status" className="rounded-2xl bg-white p-6 shadow-md text-slate-600">
            Loading session evidence…
          </p>
        )}
        {evidence && <SessionEvidenceDetail evidence={evidence} />}
      </div>
    </main>
  );
};
