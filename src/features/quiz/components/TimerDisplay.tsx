interface TimerDisplayProps {
  configuredSeconds: number;
  remainingSeconds: number;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const getTimerColor = (remainingSeconds: number, configuredSeconds: number): string => {
  if (remainingSeconds > configuredSeconds * 0.5) return 'text-green-500';
  if (remainingSeconds > configuredSeconds * 0.2) return 'text-yellow-500';
  return 'text-red-500';
};

export const TimerDisplay = ({ configuredSeconds, remainingSeconds }: TimerDisplayProps) => (
  <div
    className={`mt-6 text-9xl font-mono font-bold tracking-wider transition-colors duration-500 ${getTimerColor(remainingSeconds, configuredSeconds)}`}
  >
    {formatTime(remainingSeconds)}
  </div>
);
