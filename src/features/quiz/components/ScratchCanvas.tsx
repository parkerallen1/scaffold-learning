import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';

interface ScratchCanvasProps {
  children: ReactNode;
  questionIndex: number;
}

export interface ScratchCanvasHandle {
  clear: () => void;
}

export const ScratchCanvas = forwardRef<ScratchCanvasHandle, ScratchCanvasProps>(
  ({ children, questionIndex }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activePointerIdRef = useRef<number | null>(null);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }, []);

    useImperativeHandle(ref, () => ({ clear: clearCanvas }), [clearCanvas]);

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
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    useEffect(() => {
      clearCanvas();
    }, [clearCanvas, questionIndex]);

    const getCoords = (event: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
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
    };

    const stopDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.closePath();
      activePointerIdRef.current = null;

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
          <button
            onClick={clearCanvas}
            className="text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-4 py-2 rounded-md transition-colors"
          >
            Clear
          </button>
        </div>
        <div className="flex-grow relative border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full bg-white dark:bg-gray-700 cursor-crosshair"
            aria-label="Scratch work area"
            style={{ touchAction: 'none' }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          {children}
        </div>
      </div>
    );
  },
);

ScratchCanvas.displayName = 'ScratchCanvas';
