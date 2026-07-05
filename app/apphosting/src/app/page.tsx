'use client';

import { getWorkspaces } from '#app/web/api-client';
import type { WorkspaceSummary } from '#app/web/api-schemas';
import { signOutHelper } from '#app/web/firebase-client';
import { FullScreenLoader } from '#app/web/spinner';
import { useAuth } from '#app/web/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';

type LoadState =
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly workspaces: readonly WorkspaceSummary[];
    }
  | { readonly kind: 'loading' };

const WorkspacePicker = ({
  workspaces,
}: {
  readonly workspaces: readonly WorkspaceSummary[];
}): JSX.Element => {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-xl font-semibold text-ink">Choose a workspace</h1>
      <ul className="space-y-2">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <button
              className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-accent hover:shadow-sm"
              onClick={() => {
                router.replace(`/w/${workspace.id}`);
              }}
              type="button"
            >
              <span className="font-medium text-ink">{workspace.name}</span>
              <span className="text-sm text-muted">{workspace.timezone}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const NoWorkspace = (): JSX.Element => (
  <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
    <p className="text-lg font-medium text-ink">
      No workspace found for your Slack account
    </p>
    <p className="text-sm text-muted">
      Ask a workspace admin to add your Slack account, then sign in again.
    </p>
    <button
      className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-accent"
      onClick={() => void signOutHelper()}
      type="button"
    >
      Sign out
    </button>
  </div>
);

const HomePage = (): JSX.Element => {
  const router = useRouter();
  const { loading, user } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (loading) {
      return;
    }
    if (user === null) {
      router.replace('/login');
      return;
    }
    /* eslint-disable-next-line functional/no-let -- Effect-local cancellation flag by design. */
    let active = true;
    const run = async (): Promise<void> => {
      try {
        const workspaces = await getWorkspaces();
        if (!active) {
          return;
        }
        if (workspaces.length === 1) {
          const [only] = workspaces;
          if (only !== undefined) {
            router.replace(`/w/${only.id}`);
            return;
          }
        }
        setState({ kind: 'loaded', workspaces });
      } catch {
        if (active) {
          setState({
            kind: 'error',
            message: 'Could not load your workspaces.',
          });
        }
      }
    };
    void run();
    return (): void => {
      active = false;
    };
  }, [loading, router, user]);

  if (loading || user === null) {
    return <FullScreenLoader />;
  }
  if (state.kind === 'loading') {
    return <FullScreenLoader />;
  }
  if (state.kind === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center text-danger">
        {state.message}
      </div>
    );
  }
  if (state.workspaces.length === 0) {
    return <NoWorkspace />;
  }
  return <WorkspacePicker workspaces={state.workspaces} />;
};

export default HomePage;
