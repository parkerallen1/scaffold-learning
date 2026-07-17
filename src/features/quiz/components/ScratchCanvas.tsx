import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, TouchEvent } from 'react';

interface ScratchCanvasProps {
  children: ReactNode;
  questionIndex: number;
}

export interface ScratchCanvasHandle {
  clear: () => void;
}

export const ScratchCanvas = forwardRef<ScratchCanvasHandle, ScratchCanvasProps>(
  ({ children, questionIndex }, ref) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
        if (parent) {
          canvas.width = parent.clientWidth;
          canvas.height = parent.clientHeight;
          const context = canvas.getContext('2d');
          if (context) {
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.strokeStyle = 'black';
            context.lineWidth = 3;
          }
        }
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }, [clearCanvas, questionIndex]);

    const getCoords = (event: MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if ('touches' in event.nativeEvent) {
        return {
          x: event.nativeEvent.touches[0].clientX - rect.left,
          y: event.nativeEvent.touches[0].clientY - rect.top,
        };
      }
      return {
        x: event.nativeEvent.clientX - rect.left,
        y: event.nativeEvent.clientY - rect.top,
      };
    };

    const startDrawing = (event: MouseEvent | TouchEvent) => {
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      const { x, y } = getCoords(event);
      context.beginPath();
      context.moveTo(x, y);
      setIsDrawing(true);
    };

    const draw = (event: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      event.preventDefault();
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      const { x, y } = getCoords(event);
      context.lineTo(x, y);
      context.stroke();
    };

    const stopDrawing = () => {
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      context.closePath();
      setIsDrawing(false);
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
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {children}
        </div>
      </div>
    );
  },
);

ScratchCanvas.displayName = 'ScratchCanvas';
