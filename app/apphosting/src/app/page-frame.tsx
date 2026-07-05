import { AppOpenAction } from '#app/app/app-open-action';
import type { FallbackPageCopy } from '#app/app/content';
import type { JSX } from 'react';

interface PageFrameProps {
  readonly actionHref: string;
  readonly copy: FallbackPageCopy;
  readonly fallbackHref?: string;
}

export const PageFrame = ({
  actionHref,
  copy,
  fallbackHref,
}: PageFrameProps): JSX.Element => (
  <main className="page-shell">
    <section aria-label={copy.eyebrow} className="page-main">
      <div className="page-copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="title">{copy.title}</h1>
        <p className="body">{copy.body}</p>
        <p className="secondary">{copy.secondary}</p>
        <div className="action-row">
          <AppOpenAction
            {...(fallbackHref === undefined ? {} : { fallbackHref })}
            href={actionHref}
            label={copy.actionLabel}
          />
        </div>
      </div>
      <div aria-hidden="true" className="asset-panel">
        <img
          alt=""
          className="app-mark"
          height="1024"
          src="/exe-icon.png"
          width="1024"
        />
      </div>
    </section>
  </main>
);
