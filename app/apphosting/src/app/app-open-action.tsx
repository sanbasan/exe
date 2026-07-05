'use client';

import type { JSX, MouseEvent } from 'react';

interface AppOpenActionProps {
  readonly fallbackHref?: string;
  readonly href: string;
  readonly label: string;
}

export const AppOpenAction = ({
  fallbackHref,
  href,
  label,
}: AppOpenActionProps): JSX.Element => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (fallbackHref === undefined) {
      return;
    }

    event.preventDefault();
    window.location.assign(href);
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.location.assign(fallbackHref);
      }
    }, 900);
  };

  return (
    <a className="primary-action" href={href} onClick={handleClick}>
      {label}
    </a>
  );
};
