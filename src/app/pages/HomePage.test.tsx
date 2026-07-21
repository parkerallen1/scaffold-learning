import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('opens the populated teacher demo from the primary demo link', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Explore the demo' })).toHaveAttribute(
      'href',
      '/teacher?demo=1',
    );
    expect(screen.queryByText(/synthetic quiz demo/i)).not.toBeInTheDocument();
  });
});
