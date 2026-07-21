import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('offers only the teacher and student role choices', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Teacher' })).toHaveAttribute('href', '/teacher');
    expect(screen.getByRole('link', { name: 'Student' })).toHaveAttribute('href', '/student');
    expect(screen.queryByRole('link', { name: 'Explore the demo' })).not.toBeInTheDocument();
  });
});
