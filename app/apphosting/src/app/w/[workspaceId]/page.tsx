'use client';

import { getWorkspaces } from '#app/web/api-client';
import { signOutHelper } from '#app/web/firebase-client';
import { GanttTab } from '#app/web/gantt/gantt-tab';
import { MeetingsTab } from '#app/web/meetings-tab';
import { RecordTab } from '#app/web/record-tab';
import { FullScreenLoader } from '#app/web/spinner';
import { useAuth } from '#app/web/use-auth';
import { useWorkspaceData } from '#app/web/workspace-data';
import type { Meeting } from '@exe/domain';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';

type TabId = 'gantt' | 'meetings' | 'record';

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'gantt', label: 'Gantt' },
  { id: 'record', label: 'Record' },
  { id: 'meetings', label: 'Meetings' },
];

const WorkspacePage = (): JSX.Element => {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const { workspaceId } = params;
  const { loading: authLoading, user } = useAuth();
  const [tab, setTab] = useState<TabId>('gantt');
  const [workspaceName, setWorkspaceName] = useState('');
  const [pinnedMeetingId, setPinnedMeetingId] = useState('');
  const data = useWorkspaceData({
    enabled: !authLoading && user !== null,
    workspaceId,
  });

  useEffect(() => {
    if (!authLoading && user === null) {
      router.replace('/login');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || user === null) {
      return;
    }
    void getWorkspaces()
      .then((workspaces) => {
        const match = workspaces.find(
          (workspace) => workspace.id === workspaceId
        );
        setWorkspaceName(match?.name ?? workspaceId);
      })
      .catch(() => {
        setWorkspaceName(workspaceId);
      });
  }, [authLoading, user, workspaceId]);

  if (authLoading || user === null || data.loading) {
    return <FullScreenLoader />;
  }

  const handleMeetingCreated = (meeting: Meeting): void => {
    setPinnedMeetingId(meeting.id);
    setTab('meetings');
  };

  const handleTasksChanged = (): void => {
    void data.refetchTasks().catch(() => null);
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold lowercase tracking-tight text-accent">
              exe
            </span>
            <span className="text-sm font-medium text-muted">
              {workspaceName === '' ? workspaceId : workspaceName}
            </span>
          </div>
          <nav className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
            {TABS.map((entry) => (
              <button
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  tab === entry.id
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
                key={entry.id}
                onClick={() => {
                  setTab(entry.id);
                }}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </nav>
          <button
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
            onClick={() => {
              void signOutHelper().then(() => {
                router.replace('/login');
              });
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        {data.error !== null ? (
          <p className="mb-4 text-sm text-danger">{data.error}</p>
        ) : null}
        {tab === 'gantt' ? (
          <GanttTab
            channels={data.channels}
            members={data.members}
            refetchTasks={data.refetchTasks}
            tasks={data.tasks}
            workspaceId={workspaceId}
          />
        ) : null}
        {tab === 'record' ? (
          <RecordTab
            channels={data.channels}
            members={data.members}
            onMeetingCreated={handleMeetingCreated}
            workspaceId={workspaceId}
          />
        ) : null}
        {tab === 'meetings' ? (
          <MeetingsTab
            members={data.members}
            onTasksChanged={handleTasksChanged}
            tasks={data.tasks}
            workspaceId={workspaceId}
            {...(pinnedMeetingId !== '' ? { pinnedMeetingId } : {})}
          />
        ) : null}
      </main>
    </div>
  );
};

export default WorkspacePage;
