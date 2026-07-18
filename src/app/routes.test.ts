import { describe, expect, it } from 'vitest';

import { resolveAppRoute } from './routes';

describe('resolveAppRoute', () => {
  it.each([
    ['/', 'home'],
    ['/demo', 'demo'],
    ['/student', 'student'],
    ['/teacher', 'teacher-home'],
    ['/teacher/assignments', 'teacher-assignments'],
    ['/teacher/assignments/', 'teacher-assignments'],
    ['/teacher/planning', 'teacher-planning'],
    ['/teacher/planning/', 'teacher-planning'],
    ['/teacher/preview', 'teacher-preview'],
    ['/teacher/preview/', 'teacher-preview'],
    ['/unknown', 'not-found'],
  ] as const)('maps %s to %s', (pathname, expectedRoute) => {
    expect(resolveAppRoute(pathname)).toBe(expectedRoute);
  });
});
