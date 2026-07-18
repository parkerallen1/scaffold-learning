export type AppRoute =
  'demo' | 'home' | 'not-found' | 'student' | 'teacher-home' | 'teacher-preview';

export const resolveAppRoute = (pathname: string): AppRoute => {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  switch (normalizedPath) {
    case '/':
      return 'home';
    case '/demo':
      return 'demo';
    case '/student':
      return 'student';
    case '/teacher':
      return 'teacher-home';
    case '/teacher/preview':
      return 'teacher-preview';
    default:
      return 'not-found';
  }
};
