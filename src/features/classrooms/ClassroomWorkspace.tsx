import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { BUILD_WEEK_STUDENT_PIN, type Classroom, type StudentSafeIdentity } from '@/lib/domain';

import {
  archiveClassroom,
  createClassroom,
  createStudent,
  disableStudent,
  resetStudentPin,
  rotateClassCode,
} from './classroomService';
import { CredentialReveal } from './CredentialReveal';
import { useClassroomStudents, useOwnedClassrooms } from './useClassrooms';

type SecretNotice = {
  details: { label: string; value: string }[];
  message: string;
  title: string;
};

const InlineError = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
    {message}
  </p>
);

const ClassroomList = ({
  classrooms,
  onSelect,
  selectedId,
}: {
  classrooms: Classroom[];
  onSelect: (classroomId: string) => void;
  selectedId: string | null;
}) => (
  <ul className="mt-4 space-y-2">
    {classrooms.map((classroom) => (
      <li key={classroom.id}>
        <button
          type="button"
          aria-pressed={selectedId === classroom.id}
          onClick={() => onSelect(classroom.id)}
          className={`w-full rounded-xl border p-3 text-left transition ${
            selectedId === classroom.id
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <span className="block font-semibold text-slate-900">{classroom.name}</span>
          <span className="mt-1 block text-xs capitalize text-slate-500">{classroom.status}</span>
        </button>
      </li>
    ))}
  </ul>
);

const CopyableCredential = ({ label, value }: { label: string; value: string }) => {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'idle' | 'unavailable'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('unavailable');
    }
  };

  return (
    <button
      type="button"
      aria-label={`Copy ${label.toLowerCase()} ${value}`}
      onClick={() => void copy()}
      className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left hover:border-blue-400 hover:bg-blue-50"
    >
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-0.5 flex items-center gap-2">
        <code className="font-mono font-bold text-slate-900">{value}</code>
        <span className="text-xs font-semibold text-blue-700">
          {copyStatus === 'copied'
            ? 'Copied'
            : copyStatus === 'unavailable'
              ? 'Select to copy'
              : 'Copy'}
        </span>
      </span>
    </button>
  );
};

const StudentRow = ({
  classroom,
  demoMode,
  isWorking,
  onDisable,
  onResetPin,
  student,
}: {
  classroom: Classroom;
  demoMode: boolean;
  isWorking: boolean;
  onDisable: (student: StudentSafeIdentity) => void;
  onResetPin: (student: StudentSafeIdentity) => void;
  student: StudentSafeIdentity;
}) => (
  <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
    <div>
      <p className="font-semibold text-slate-900">{student.displayName}</p>
      <p className="mt-1 text-xs text-slate-500">
        <span className="capitalize">{student.status}</span> · Access version {student.authVersion}
      </p>
      {demoMode && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Build Week student credentials">
          {student.studentHandle && (
            <CopyableCredential label="Student handle" value={student.studentHandle} />
          )}
          <CopyableCredential label="Student PIN" value={BUILD_WEEK_STUDENT_PIN} />
        </div>
      )}
    </div>
    <div className="flex flex-wrap gap-2">
      <a
        href={`/teacher/planning?classroomId=${encodeURIComponent(classroom.id)}&studentId=${encodeURIComponent(student.id)}`}
        className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        aria-label={`Plan supports for ${student.displayName}`}
      >
        Plan supports
      </a>
      {classroom.status === 'active' && (
        <>
          {!demoMode && (
            <button
              type="button"
              onClick={() => onResetPin(student)}
              disabled={isWorking}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {student.status === 'disabled' ? 'Reset PIN & enable' : 'Reset PIN'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDisable(student)}
            disabled={isWorking || student.status === 'disabled'}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Disable access
          </button>
        </>
      )}
    </div>
  </li>
);

export const ClassroomWorkspace = ({
  demoMode = false,
  teacherId,
}: {
  demoMode?: boolean;
  teacherId: string;
}) => {
  const classrooms = useOwnedClassrooms(teacherId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingSelection = useRef<string | null>(null);
  const [classroomName, setClassroomName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [secretNotice, setSecretNotice] = useState<SecretNotice | null>(null);

  const selectedClassroom =
    classrooms.data.find((classroom) => classroom.id === selectedId) ?? null;
  const students = useClassroomStudents(selectedClassroom?.id ?? null);

  useEffect(() => {
    if (classrooms.isLoading || classrooms.data.length === 0) return;
    if (selectedId && classrooms.data.some((classroom) => classroom.id === selectedId)) {
      if (pendingSelection.current === selectedId) pendingSelection.current = null;
      return;
    }
    if (selectedId && pendingSelection.current === selectedId) return;
    const firstActive = classrooms.data.find((classroom) => classroom.status === 'active');
    setSelectedId(firstActive?.id ?? classrooms.data[0].id);
  }, [classrooms.data, classrooms.isLoading, selectedId]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setActionError(null);
    setActionNotice(null);
    setPendingAction(key);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to complete that action. Please try again.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateClassroom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = classroomName.trim();
    void runAction('create-classroom', async () => {
      const result = await createClassroom(name);
      pendingSelection.current = result.classroom.id;
      setSelectedId(result.classroom.id);
      setClassroomName('');
      setSecretNotice({
        title: `Save the code for ${result.classroom.name}`,
        message:
          'Share this code only with students in this class. It cannot be recovered after you close this message; rotate it if it is lost.',
        details: [{ label: 'Class code', value: result.classCode }],
      });
    });
  };

  const handleCreateStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClassroom) return;
    const displayName = studentName.trim();
    void runAction('create-student', async () => {
      const result = await createStudent({
        classroomId: selectedClassroom.id,
        displayName,
      });
      setStudentName('');
      if (demoMode) {
        setActionNotice(
          `${result.student.displayName} created. Click the handle or PIN in the roster to copy it.`,
        );
      } else {
        setSecretNotice({
          title: `Save sign-in details for ${result.student.displayName}`,
          message:
            'Give these details directly to the student. The PIN cannot be recovered after you close this message; reset it if it is lost.',
          details: [
            { label: 'Student handle', value: result.studentHandle },
            { label: 'One-time PIN', value: result.oneTimePin },
          ],
        });
      }
    });
  };

  const handleRotateCode = () => {
    if (!selectedClassroom) return;
    if (!window.confirm('Rotate this class code? The previous code will stop working immediately.'))
      return;
    void runAction('rotate-code', async () => {
      const classCode = await rotateClassCode(selectedClassroom.id);
      setSecretNotice({
        title: `Save the new code for ${selectedClassroom.name}`,
        message:
          'The previous code no longer works. This replacement cannot be recovered after you close this message.',
        details: [{ label: 'Class code', value: classCode }],
      });
    });
  };

  const handleArchive = () => {
    if (!selectedClassroom) return;
    if (
      !window.confirm(
        `Archive ${selectedClassroom.name}? Students will no longer be able to sign in to this class.`,
      )
    )
      return;
    void runAction('archive-classroom', async () => {
      await archiveClassroom(selectedClassroom.id);
    });
  };

  const handleResetPin = (student: StudentSafeIdentity) => {
    if (!selectedClassroom) return;
    if (
      !window.confirm(
        `Reset the PIN for ${student.displayName}? Existing sessions will be revoked${
          student.status === 'disabled' ? ' and access will be enabled' : ''
        }.`,
      )
    )
      return;
    void runAction(`reset-${student.id}`, async () => {
      const result = await resetStudentPin(selectedClassroom.id, student.id);
      setSecretNotice({
        title: `Save the new PIN for ${result.student.displayName}`,
        message:
          'The previous PIN and sessions no longer work. This PIN cannot be recovered after you close this message.',
        details: [{ label: 'One-time PIN', value: result.oneTimePin }],
      });
    });
  };

  const handleDisableStudent = (student: StudentSafeIdentity) => {
    if (!selectedClassroom) return;
    if (!window.confirm(`Disable access for ${student.displayName}? Active sessions will end.`))
      return;
    void runAction(`disable-${student.id}`, async () => {
      await disableStudent(selectedClassroom.id, student.id);
    });
  };

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
      {secretNotice && (
        <CredentialReveal {...secretNotice} onAcknowledge={() => setSecretNotice(null)} />
      )}

      <aside className="rounded-2xl bg-white p-5 shadow-md">
        <h2 className="text-xl font-bold">Classrooms</h2>
        <form className="mt-4" onSubmit={handleCreateClassroom}>
          <label className="block text-sm font-semibold text-slate-700">
            New classroom name
            <input
              required
              value={classroomName}
              onChange={(event) => setClassroomName(event.target.value)}
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={pendingAction !== null}
            className="mt-3 w-full rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {pendingAction === 'create-classroom' ? 'Creating…' : 'Create classroom'}
          </button>
        </form>

        {classrooms.isLoading && (
          <p role="status" className="mt-4 text-sm text-slate-600">
            Loading classrooms…
          </p>
        )}
        {classrooms.error && (
          <div className="mt-4">
            <InlineError message={classrooms.error} />
          </div>
        )}
        {!classrooms.isLoading && !classrooms.error && classrooms.data.length === 0 && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            No classrooms yet. Create one to get a class code.
          </p>
        )}
        <ClassroomList
          classrooms={classrooms.data}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </aside>

      <div className="space-y-6">
        {actionError && <InlineError message={actionError} />}
        {actionNotice && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            {actionNotice}
          </p>
        )}
        {!selectedClassroom && !classrooms.isLoading && classrooms.data.length > 0 && (
          <p role="status" className="rounded-2xl bg-white p-6 shadow-md">
            Select a classroom to manage its students.
          </p>
        )}
        {selectedClassroom && (
          <>
            <section className="rounded-2xl bg-white p-6 shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    {selectedClassroom.status} classroom
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">{selectedClassroom.name}</h2>
                </div>
                {selectedClassroom.status === 'active' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRotateCode}
                      disabled={pendingAction !== null}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                    >
                      Rotate class code
                    </button>
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={pendingAction !== null}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Archive classroom
                    </button>
                  </div>
                )}
              </div>
              {selectedClassroom.status === 'archived' && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  This class is archived. Its roster is read-only and student sign-in is disabled.
                </p>
              )}
            </section>

            {selectedClassroom.status === 'active' && (
              <section className="rounded-2xl bg-white p-6 shadow-md">
                <h3 className="text-xl font-bold">Add a student</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Enter a classroom-only display name. A unique student handle will be generated
                  automatically.
                </p>
                <form className="mt-4" onSubmit={handleCreateStudent}>
                  <label className="text-sm font-semibold text-slate-700">
                    Display name
                    <input
                      required
                      value={studentName}
                      onChange={(event) => setStudentName(event.target.value)}
                      maxLength={80}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pendingAction !== null}
                    className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {pendingAction === 'create-student' ? 'Creating student…' : 'Create student'}
                  </button>
                </form>
              </section>
            )}

            <section className="rounded-2xl bg-white p-6 shadow-md">
              <h3 className="text-xl font-bold">Students</h3>
              {students.isLoading && (
                <p role="status" className="mt-4 text-sm text-slate-600">
                  Loading students…
                </p>
              )}
              {students.error && (
                <div className="mt-4">
                  <InlineError message={students.error} />
                </div>
              )}
              {!students.isLoading && !students.error && students.data.length === 0 && (
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  No students in this classroom yet.
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {students.data.map((student) => (
                  <StudentRow
                    key={student.id}
                    classroom={selectedClassroom}
                    demoMode={demoMode}
                    student={student}
                    isWorking={pendingAction !== null}
                    onDisable={handleDisableStudent}
                    onResetPin={handleResetPin}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </section>
  );
};
