import type { JSX } from 'react';

interface SpinnerProps {
  readonly className?: string;
}

export const Spinner = ({ className }: SpinnerProps): JSX.Element => (
  <span
    aria-hidden
    className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? 'h-4 w-4'}`}
  />
);

export const FullScreenLoader = (): JSX.Element => (
  <div className="flex min-h-dvh items-center justify-center text-accent">
    <Spinner className="h-8 w-8" />
  </div>
);
