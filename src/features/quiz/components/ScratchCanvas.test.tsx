import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScratchCanvas } from './ScratchCanvas';
import type { ScratchCanvasHandle } from './ScratchCanvas';

describe('ScratchCanvas', () => {
  it('scales pointer coordinates to the canvas bitmap on a narrower rendered surface', () => {
    const ref = createRef<ScratchCanvasHandle>();
    render(
      <ScratchCanvas ref={ref} questionIndex={0}>
        <span>Answer controls</span>
      </ScratchCanvas>,
    );

    const canvas = screen.getByLabelText('Freehand scratch work area') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    canvas.width = 600;
    canvas.height = 400;

    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
      getBoundingClientRect: {
        configurable: true,
        value: vi.fn(() => ({
          bottom: 220,
          height: 200,
          left: 10,
          right: 310,
          top: 20,
          width: 300,
          x: 10,
          y: 20,
          toJSON: vi.fn(),
        })),
      },
    });

    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 30,
      clientY: 50,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'pen',
    });
    fireEvent.pointerMove(canvas, {
      clientX: 50,
      clientY: 80,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'pen',
    });
    fireEvent.pointerUp(canvas, {
      isPrimary: true,
      pointerId: 7,
      pointerType: 'pen',
    });

    expect(canvas.style.touchAction).toBe('none');
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(context.beginPath).toHaveBeenCalled();
    expect(context.moveTo).toHaveBeenCalledWith(40, 60);
    expect(context.lineTo).toHaveBeenCalledWith(80, 120);
    expect(context.stroke).toHaveBeenCalled();
    expect(context.closePath).toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    act(() => ref.current?.clear());

    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, canvas.width, canvas.height);
  });

  it('copies the bitmap across resize and clears it when the question changes', () => {
    const { rerender } = render(
      <ScratchCanvas questionIndex={0}>
        <span>Answer controls</span>
      </ScratchCanvas>,
    );

    const canvas = screen.getByLabelText('Freehand scratch work area') as HTMLCanvasElement;
    const parent = canvas.parentElement!;
    const context = canvas.getContext('2d')!;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    Object.defineProperties(parent, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 360 },
    });
    vi.mocked(context.drawImage).mockClear();
    vi.mocked(context.clearRect).mockClear();

    fireEvent(window, new Event('resize'));

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(context.drawImage).toHaveBeenCalledWith(canvas, 0, 0);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      0,
      0,
      originalWidth,
      originalHeight,
      0,
      0,
      640,
      360,
    );
    expect(context.clearRect).not.toHaveBeenCalled();

    rerender(
      <ScratchCanvas questionIndex={1}>
        <span>Answer controls</span>
      </ScratchCanvas>,
    );

    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 640, 360);
  });

  it('provides keyboard-accessible scratch notes and starts them blank for a new question', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ScratchCanvas questionIndex={0}>
        <span>Answer controls</span>
      </ScratchCanvas>,
    );

    const notes = screen.getByRole('textbox', { name: 'Typed scratch notes' });
    await user.type(notes, '12 divided by 3');
    expect(notes).toHaveValue('12 divided by 3');

    rerender(
      <ScratchCanvas questionIndex={1}>
        <span>Answer controls</span>
      </ScratchCanvas>,
    );
    expect(screen.getByRole('textbox', { name: 'Typed scratch notes' })).toHaveValue('');
  });
});
