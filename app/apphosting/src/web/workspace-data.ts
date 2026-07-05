'use client';

import { getChannels, getSlackMembers, getTasks } from '#app/web/api-client';
import type { ChannelSummary, SlackMember } from '#app/web/api-schemas';
import type { WorkTask } from '@exe/domain';
import { useCallback, useEffect, useState } from 'react';

/* eslint-disable functional/no-mixed-types -- Hook result mixes live data with its refetch callback by design. */
export interface WorkspaceData {
  readonly channels: readonly ChannelSummary[];
  readonly error: string | null;
  readonly loading: boolean;
  readonly members: readonly SlackMember[];
  readonly refetchTasks: () => Promise<void>;
  readonly tasks: readonly WorkTask[];
}
/* eslint-enable functional/no-mixed-types */

export const useWorkspaceData = ({
  enabled,
  workspaceId,
}: {
  readonly enabled: boolean;
  readonly workspaceId: string;
}): WorkspaceData => {
  const [tasks, setTasks] = useState<readonly WorkTask[]>([]);
  const [members, setMembers] = useState<readonly SlackMember[]>([]);
  const [channels, setChannels] = useState<readonly ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    /* eslint-disable-next-line functional/no-let -- Effect-local cancellation flag by design. */
    let active = true;
    const run = async (): Promise<void> => {
      try {
        const [loadedTasks, loadedMembers, loadedChannels] = await Promise.all([
          getTasks({ workspaceId }),
          getSlackMembers({ workspaceId }),
          getChannels({ workspaceId }),
        ]);
        if (!active) {
          return;
        }
        setTasks(loadedTasks);
        setMembers(loadedMembers);
        setChannels(loadedChannels);
        setLoading(false);
      } catch {
        if (active) {
          setError('Could not load workspace data.');
          setLoading(false);
        }
      }
    };
    void run();
    return (): void => {
      active = false;
    };
  }, [enabled, workspaceId]);

  const refetchTasks = useCallback(async (): Promise<void> => {
    const loadedTasks = await getTasks({ workspaceId });
    setTasks(loadedTasks);
  }, [workspaceId]);

  return { channels, error, loading, members, refetchTasks, tasks };
};
