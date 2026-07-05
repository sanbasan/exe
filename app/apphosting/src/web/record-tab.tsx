'use client';
import { createMeeting, isApiError } from '#app/web/api-client';
import type {
  ChannelSummary,
  Meeting,
  SlackMember,
} from '#app/web/api-schemas';
import { blobToBase64, formatClock } from '#app/web/format';
import { MemberMultiSelect } from '#app/web/member-multi-select';
import { Spinner } from '#app/web/spinner';
import { useRecorder, type RecordingResult } from '#app/web/use-recorder';
import { useEffect, useState, type JSX } from 'react';

// eslint-disable-next-line functional/no-mixed-types -- Props mix a creation callback with data fields, which is intrinsic to a React component prop bag.
interface RecordTabProps {
  readonly channels: readonly ChannelSummary[];
  readonly members: readonly SlackMember[];
  readonly onMeetingCreated: (meeting: Meeting) => void;
  readonly workspaceId: string;
}

type UploadState = 'error' | 'idle' | 'uploading';

interface ButtonFlags {
  readonly isPaused: boolean;
  readonly isRecording: boolean;
  readonly isUploading: boolean;
}

const UPLOAD_FAILED_MESSAGE = 'Upload failed. Please try again.';

const MicGlyph = (): JSX.Element => (
  <svg
    aria-hidden
    className="h-9 w-9"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v4" />
  </svg>
);

const StopGlyph = (): JSX.Element => (
  <svg aria-hidden className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
    <rect height="12" rx="2" width="12" x="6" y="6" />
  </svg>
);

const recordButtonColor = ({
  isPaused,
  isRecording,
  isUploading,
}: ButtonFlags): string => {
  if (isUploading) {
    return 'bg-muted';
  }
  if (isRecording) {
    return 'bg-danger';
  }
  if (isPaused) {
    return 'bg-muted';
  }
  return 'bg-accent hover:bg-accent/90';
};

const statusLabel = ({
  isPaused,
  isRecording,
  isUploading,
}: ButtonFlags): string => {
  if (isUploading) {
    return 'Uploading…';
  }
  if (isRecording) {
    return 'Recording';
  }
  if (isPaused) {
    return 'Paused';
  }
  return 'Tap to record';
};

const resolveUploadError = (error: unknown): string =>
  isApiError(error) ? error.message : UPLOAD_FAILED_MESSAGE;

const renderGlyph = ({
  isActive,
  isUploading,
}: {
  readonly isActive: boolean;
  readonly isUploading: boolean;
}): JSX.Element => {
  if (isUploading) {
    return <Spinner className="h-6 w-6" />;
  }
  if (isActive) {
    return <StopGlyph />;
  }
  return <MicGlyph />;
};

export const RecordTab = ({
  channels,
  members,
  onMeetingCreated,
  workspaceId,
}: RecordTabProps): JSX.Element => {
  const recorder = useRecorder();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [participantIds, setParticipantIds] = useState<readonly string[]>([]);
  const [pendingResult, setPendingResult] = useState<RecordingResult | null>(
    null
  );

  const isRecording = recorder.status === 'recording';
  const isPaused = recorder.status === 'paused';
  const isActive = isRecording || isPaused;
  const isUploading = uploadState === 'uploading';
  const flags: ButtonFlags = { isPaused, isRecording, isUploading };

  useEffect((): (() => void) | undefined => {
    if (!isActive) {
      return undefined;
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // eslint-disable-next-line functional/immutable-data, @typescript-eslint/no-deprecated -- Legacy browsers only show the unsaved-recording prompt when the deprecated returnValue is set on the beforeunload event.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return (): void => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isActive]);

  const uploadRecording = async (result: RecordingResult): Promise<void> => {
    setUploadState('uploading');
    setUploadError(null);
    try {
      const audioBase64 = await blobToBase64(result.blob);
      const meeting = await createMeeting({
        input: {
          audioBase64,
          durationSeconds: result.durationSeconds,
          mimeType: result.mimeType,
          ...(selectedChannelId !== '' ? { channelId: selectedChannelId } : {}),
          ...(participantIds.length > 0
            ? { participantSlackUserIds: [...participantIds] }
            : {}),
        },
        workspaceId,
      });
      setPendingResult(null);
      setUploadState('idle');
      onMeetingCreated(meeting);
    } catch (error: unknown) {
      setPendingResult(result);
      setUploadError(resolveUploadError(error));
      setUploadState('error');
    }
  };

  const handleRecordClick = async (): Promise<void> => {
    if (recorder.status === 'idle') {
      setUploadState('idle');
      setUploadError(null);
      setPendingResult(null);
      await recorder.start();
      return;
    }
    const result = await recorder.stop();
    await uploadRecording(result);
  };

  const handleRetry = (): void => {
    if (pendingResult !== null) {
      void uploadRecording(pendingResult);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-8">
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">Channel</span>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isActive || isUploading}
            onChange={(event) => setSelectedChannelId(event.target.value)}
            value={selectedChannelId}
          >
            <option value="">Auto-assign channel</option>
            {channels.map((channel) => (
              <option key={channel.channelId} value={channel.channelId}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">
            Participants (optional)
          </span>
          <MemberMultiSelect
            members={members}
            onChange={setParticipantIds}
            selection={participantIds}
          />
        </div>

        <p className="text-center text-5xl font-semibold tabular-nums text-ink">
          {formatClock(recorder.elapsedSeconds)}
        </p>

        <div className="flex h-16 items-end justify-center gap-1">
          {recorder.levels.map((level, index) => (
            <div
              className={`w-2 rounded-full transition-[height] duration-75 ${isActive ? 'bg-accent' : 'bg-line'}`}
              key={index}
              style={{
                height: `${String(Math.max(6, Math.round(level * 100)))}%`,
              }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-24 w-24 items-center justify-center">
            {isRecording ? (
              <span
                aria-hidden
                className="absolute -inset-1 animate-pulse rounded-full bg-danger/25"
              />
            ) : null}
            <button
              aria-label={isActive ? 'Stop recording' : 'Start recording'}
              className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-sm transition disabled:cursor-not-allowed ${recordButtonColor(flags)}`}
              disabled={isUploading}
              onClick={() => void handleRecordClick()}
              type="button"
            >
              {renderGlyph({ isActive, isUploading })}
            </button>
          </div>

          <p className="text-sm text-muted">{statusLabel(flags)}</p>

          {isActive ? (
            <button
              className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
              onClick={isRecording ? recorder.pause : recorder.resume}
              type="button"
            >
              {isRecording ? 'Pause' : 'Resume'}
            </button>
          ) : null}
        </div>

        {recorder.error !== null ? (
          <p className="text-center text-sm text-danger">{recorder.error}</p>
        ) : null}

        {uploadState === 'error' ? (
          <div className="flex flex-col items-center gap-2">
            {uploadError !== null ? (
              <p className="text-center text-sm text-danger">{uploadError}</p>
            ) : null}
            <button
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              onClick={handleRetry}
              type="button"
            >
              Retry upload
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
