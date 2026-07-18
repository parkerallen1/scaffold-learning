import { useEffect, useState } from 'react';

import type { Classroom, StudentSafeIdentity } from '@/lib/domain';

import { watchClassroomStudents, watchOwnedClassrooms } from './classroomService';

type WatchedData<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
};

export const useOwnedClassrooms = (teacherId: string): WatchedData<Classroom[]> => {
  const [snapshot, setSnapshot] = useState<
    (WatchedData<Classroom[]> & { teacherId: string }) | null
  >(null);

  useEffect(
    () =>
      watchOwnedClassrooms(
        teacherId,
        (data) => setSnapshot({ data, error: null, isLoading: false, teacherId }),
        (error) => setSnapshot({ data: [], error: error.message, isLoading: false, teacherId }),
      ),
    [teacherId],
  );

  return snapshot?.teacherId === teacherId ? snapshot : { data: [], error: null, isLoading: true };
};

export const useClassroomStudents = (
  classroomId: string | null,
): WatchedData<StudentSafeIdentity[]> => {
  const [snapshot, setSnapshot] = useState<
    (WatchedData<StudentSafeIdentity[]> & { classroomId: string }) | null
  >(null);

  useEffect(() => {
    if (!classroomId) return;
    return watchClassroomStudents(
      classroomId,
      (data) => setSnapshot({ classroomId, data, error: null, isLoading: false }),
      (error) => setSnapshot({ classroomId, data: [], error: error.message, isLoading: false }),
    );
  }, [classroomId]);

  if (!classroomId) return { data: [], error: null, isLoading: false };
  return snapshot?.classroomId === classroomId
    ? snapshot
    : { data: [], error: null, isLoading: true };
};
