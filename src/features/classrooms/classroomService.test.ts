import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClassroom, watchClassroomStudents, watchOwnedClassrooms } from './classroomService';

const firebaseHarness = vi.hoisted(() => ({
  callables: new Map<string, ReturnType<typeof vi.fn>>(),
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  unsubscribe: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  firebaseRuntime: { callableOptions: { limitedUseAppCheckTokens: true } },
  functions: { name: 'test-functions' },
}));

vi.mock('firebase/firestore', () => ({
  collection: firebaseHarness.collection,
  onSnapshot: firebaseHarness.onSnapshot,
  query: firebaseHarness.query,
  where: firebaseHarness.where,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => {
    const callable = vi.fn();
    firebaseHarness.callables.set(name, callable);
    return callable;
  }),
}));

const classroom = {
  createdAt: 1,
  id: 'classroom-1',
  name: 'Algebra Lab',
  status: 'active',
  teacherId: 'teacher-1',
  updatedAt: 1,
};

describe('classroomService', () => {
  beforeEach(() => {
    firebaseHarness.collection.mockReset().mockImplementation((_db, ...path) => ({ path }));
    firebaseHarness.where.mockReset().mockImplementation((...constraint) => ({ constraint }));
    firebaseHarness.query.mockReset().mockImplementation((base, ...constraints) => ({
      base,
      constraints,
    }));
    firebaseHarness.onSnapshot.mockReset().mockReturnValue(firebaseHarness.unsubscribe);
    firebaseHarness.unsubscribe.mockReset();
    for (const callable of firebaseHarness.callables.values()) callable.mockReset();
  });

  it('constrains the classroom list query to the authenticated teacher id', () => {
    const onChange = vi.fn();
    const onError = vi.fn();

    const unsubscribe = watchOwnedClassrooms('teacher-1', onChange, onError);

    expect(firebaseHarness.collection).toHaveBeenCalledWith({ name: 'test-db' }, 'classrooms');
    expect(firebaseHarness.where).toHaveBeenCalledWith('teacherId', '==', 'teacher-1');
    expect(firebaseHarness.query).toHaveBeenCalledWith(
      { path: ['classrooms'] },
      { constraint: ['teacherId', '==', 'teacher-1'] },
    );
    expect(unsubscribe).toBe(firebaseHarness.unsubscribe);

    const success = firebaseHarness.onSnapshot.mock.calls[0][1] as (snapshot: unknown) => void;
    success({ docs: [{ data: () => classroom }] });
    expect(onChange).toHaveBeenCalledWith([classroom]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reads students only from the selected classroom safe-identity collection', () => {
    watchClassroomStudents('classroom-1', vi.fn(), vi.fn());

    expect(firebaseHarness.collection).toHaveBeenCalledWith(
      { name: 'test-db' },
      'classrooms',
      'classroom-1',
      'students',
    );
  });

  it('returns a generic error when callable response data is malformed', async () => {
    firebaseHarness.callables.get('createClassroom')?.mockResolvedValue({
      data: { classroom, classCode: '' },
    });

    await expect(createClassroom('Algebra Lab')).rejects.toThrow(
      'Unable to complete that action. Please try again.',
    );
  });
});
