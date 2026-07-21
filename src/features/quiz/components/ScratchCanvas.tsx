import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { PointerEvent, ReactNode } from 'react';

interface ScratchCanvasProps {
  children: ReactNode;
  questionIndex: number;
}

export interface ScratchCanvasHandle {
  clear: () => void;
}

type CanvasSnapshot = Readonly<{
  bitmap: HTMLCanvasElement;
  hadInk: boolean;
}>;

const MAX_UNDO_STEPS = 50;

export const ScratchCanvas = forwardRef<ScratchCanvasHandle, ScratchCanvasProps>(
  ({ children, questionIndex }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const pointerDrewRef = useRef(false);
    const hasInkRef = useRef(false);
    const undoHistoryRef = useRef<CanvasSnapshot[]>([]);
    const instructionsId = useId();
    const notesId = useId();
    const [notesState, setNotesState] = useState({ questionIndex, value: '' });
    const [canUndo, setCanUndo] = useState(false);
    const scratchNotes = notesState.questionIndex === questionIndex ? notesState.value : '';

    const saveUndoSnapshot = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bitmap = document.createElement('canvas');
      bitmap.width = canvas.width;
      bitmap.height = canvas.height;
      bitmap.getContext('2d')?.drawImage(canvas, 0, 0);
      undoHistoryRef.current = [
        ...undoHistoryRef.current.slice(-(MAX_UNDO_STEPS - 1)),
        { bitmap, hadInk: hasInkRef.current },
      ];
      setCanUndo(true);
    }, []);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }, []);

    const resetCanvas = useCallback(() => {
      undoHistoryRef.current = [];
      hasInkRef.current = false;
      setCanUndo(false);
      clearCanvas();
    }, [clearCanvas]);

    const undoCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const previous = undoHistoryRef.current.at(-1);
      if (!canvas || !previous) return;

      undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        previous.bitmap,
        0,
        0,
        previous.bitmap.width,
        previous.bitmap.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      hasInkRef.current = previous.hadInk;
      setCanUndo(undoHistoryRef.current.length > 0);
    }, []);

    useImperativeHandle(ref, () => ({ clear: resetCanvas }), [resetCanvas]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeCanvas = () => {
        const parent = canvas.parentElement;
        if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;

        const nextWidth = parent.clientWidth;
        const nextHeight = parent.clientHeight;
        const previousWidth = canvas.width;
        const previousHeight = canvas.height;

        if (nextWidth === previousWidth && nextHeight === previousHeight) return;

        const snapshot = document.createElement('canvas');
        snapshot.width = previousWidth;
        snapshot.height = previousHeight;
        snapshot.getContext('2d')?.drawImage(canvas, 0, 0);

        canvas.width = nextWidth;
        canvas.height = nextHeight;

        const context = canvas.getContext('2d');
        if (!context) return;

        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = 'black';
        context.lineWidth = 3;
        context.drawImage(
          snapshot,
          0,
          0,
          previousWidth,
          previousHeight,
          0,
          0,
          nextWidth,
          nextHeight,
        );
      };

      resizeCanvas();
      const resizeObserver =
        'ResizeObserver' in window
          ? new ResizeObserver(() => {
              resizeCanvas();
            })
          : null;
      if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
      window.addEventListener('resize', resizeCanvas);
      return () => {
        resizeObserver?.disconnect();
        window.removeEventListener('resize', resizeCanvas);
      };
    }, []);

    useEffect(() => {
      resetCanvas();
    }, [questionIndex, resetCanvas]);

    const getCoords = (event: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    };

    const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
      if (
        activePointerIdRef.current !== null ||
        event.isPrimary === false ||
        (event.pointerType === 'mouse' && event.button !== 0)
      ) {
        return;
      }

      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      event.preventDefault();
      saveUndoSnapshot();
      pointerDrewRef.current = false;
      const { x, y } = getCoords(event);
      context.beginPath();
      context.moveTo(x, y);
      activePointerIdRef.current = event.pointerId;

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be lost during rapid device or window changes.
      }
    };

    const draw = (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      const { x, y } = getCoords(event);
      context.lineTo(x, y);
      context.stroke();
      pointerDrewRef.current = true;
      hasInkRef.current = true;
    };

    const stopDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.closePath();
      activePointerIdRef.current = null;
      if (!pointerDrewRef.current) {
        undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
        setCanUndo(undoHistoryRef.current.length > 0);
      }

      try {
        if (canvas?.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // The browser may release capture before pointercancel or pointerleave runs.
      }
    };

    return (
      <div className="flex-grow p-6 flex flex-col relative">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Show your work</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={undoCanvas}
              disabled={!canUndo}
              className="rounded-md bg-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                if (!hasInkRef.current) return;
                saveUndoSnapshot();
                clearCanvas();
                hasInkRef.current = false;
              }}
              className="rounded-md bg-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-grow relative border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full bg-white dark:bg-gray-700 cursor-crosshair"
            role="img"
            aria-label="Freehand scratch work area"
            aria-describedby={instructionsId}
            style={{ touchAction: 'none' }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          {children}
        </div>
        <p id={instructionsId} className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Draw with a pointer, or use the keyboard-accessible scratch notes below. Scratch work is
          not submitted.
        </p>
        <label htmlFor={notesId} className="mt-2 font-semibold text-gray-700 dark:text-gray-200">
          Typed scratch notes
        </label>
        <textarea
          id={notesId}
          rows={3}
          value={scratchNotes}
          onChange={(event) => setNotesState({ questionIndex, value: event.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 dark:border-gray-500 dark:bg-gray-700 dark:text-white"
        />
      </div>
    );
  },
);

ScratchCanvas.displayName = 'ScratchCanvas';
