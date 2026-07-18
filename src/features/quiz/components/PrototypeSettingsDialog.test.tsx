import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PrototypeSettingsDialog } from './PrototypeSettingsDialog';

const Harness = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <PrototypeSettingsDialog
      interestFile={null}
      isInterestEnabled={false}
      isOpen={isOpen}
      isTimerEnabled={false}
      onBackgroundColorChange={vi.fn()}
      onClose={() => setIsOpen(false)}
      onInterestEnabledChange={vi.fn()}
      onInterestFileChange={vi.fn()}
      onOpen={() => setIsOpen(true)}
      onTimerEnabledChange={vi.fn()}
      onTimerSecondsChange={vi.fn()}
      timerSeconds={180}
    >
      <p>Quiz content</p>
    </PrototypeSettingsDialog>
  );
};

describe('PrototypeSettingsDialog', () => {
  it('has a named modal, closes on Escape, and restores focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Prototype Settings' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Prototype Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prototype Settings' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
