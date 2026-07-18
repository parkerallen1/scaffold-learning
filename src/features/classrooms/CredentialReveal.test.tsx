import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CredentialReveal } from './CredentialReveal';

const Harness = ({ onDismiss }: { onDismiss: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Create student
      </button>
      {isOpen && (
        <CredentialReveal
          title="Save the sign-in details"
          message="These details are shown once."
          details={[{ label: 'One-time PIN', value: '482901' }]}
          onAcknowledge={() => {
            setIsOpen(false);
            onDismiss();
          }}
        />
      )}
    </>
  );
};

describe('CredentialReveal', () => {
  it('moves focus inside, contains keyboard focus, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    const trigger = screen.getByRole('button', { name: 'Create student' });
    await user.click(trigger);

    const heading = await screen.findByRole('heading', { name: 'Save the sign-in details' });
    const copy = screen.getByRole('button', { name: 'Copy one-time pin' });
    const acknowledge = screen.getByRole('button', { name: 'I saved these details' });
    expect(heading).toHaveFocus();

    acknowledge.focus();
    await user.tab();
    expect(copy).toHaveFocus();
    await user.tab({ shift: true });
    expect(acknowledge).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });
});
