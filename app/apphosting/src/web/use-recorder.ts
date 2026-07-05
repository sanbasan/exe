/* eslint-disable functional/immutable-data -- Recorder session state is inherently mutable: MediaRecorder/stream/AudioContext handles, the chunk buffer, elapsed accumulators, and animation-frame/interval ids all live on refs and must be reassigned as the recording progresses. */
import { useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'paused' | 'recording';

export interface RecordingResult {
  readonly blob: Blob;
  readonly durationSeconds: number;
  readonly mimeType: string;
}

// eslint-disable-next-line functional/no-mixed-types -- Hook result mixes live recorder state with its control callbacks by design.
export interface UseRecorder {
  readonly elapsedSeconds: number;
  readonly error: string | null;
  readonly levels: readonly number[];
  readonly pause: () => void;
  readonly resume: () => void;
  readonly start: () => Promise<void>;
  readonly status: RecorderStatus;
  readonly stop: () => Promise<RecordingResult>;
}

const BAND_COUNT = 20;
const FLAT_LEVELS: readonly number[] = Array.from(
  { length: BAND_COUNT },
  () => 0
);
const OPUS_MIME_TYPE = 'audio/webm;codecs=opus';
const FALLBACK_MIME_TYPE = 'audio/webm';
const MIC_DENIED_MESSAGE =
  'Microphone access was denied. Allow microphone access in your browser settings and try again.';
const GENERIC_START_MESSAGE = 'Could not start recording.';

const isDeniedError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');

const computeBands = (data: Uint8Array): readonly number[] => {
  const bins = data.length;
  const bandSize = Math.max(1, Math.floor(bins / BAND_COUNT));
  return Array.from({ length: BAND_COUNT }, (_, band) => {
    const index = Math.min(
      bins - 1,
      band * bandSize + Math.floor(bandSize / 2)
    );
    return (data.at(index) ?? 0) / 255;
  });
};

const createRecorder = (stream: MediaStream): MediaRecorder => {
  const mimeType = MediaRecorder.isTypeSupported(OPUS_MIME_TYPE)
    ? OPUS_MIME_TYPE
    : '';
  return mimeType !== ''
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
};

export const useRecorder = (): UseRecorder => {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [levels, setLevels] = useState<readonly number[]>(FLAT_LEVELS);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedBaseRef = useRef<number>(0);
  const segmentStartRef = useRef<number | null>(null);
  const stopResolveRef = useRef<((result: RecordingResult) => void) | null>(
    null
  );

  const computeElapsedSeconds = (): number => {
    const segmentStart = segmentStartRef.current;
    const active = segmentStart !== null ? Date.now() - segmentStart : 0;
    return Math.floor((elapsedBaseRef.current + active) / 1000);
  };

  const finalizeElapsed = (): void => {
    const segmentStart = segmentStartRef.current;
    if (segmentStart !== null) {
      elapsedBaseRef.current =
        elapsedBaseRef.current + (Date.now() - segmentStart);
      segmentStartRef.current = null;
    }
    setElapsedSeconds(Math.floor(elapsedBaseRef.current / 1000));
  };

  const stopMeterLoop = (): void => {
    const raf = rafRef.current;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      rafRef.current = null;
    }
  };

  const stopInterval = (): void => {
    const id = intervalRef.current;
    if (id !== null) {
      clearInterval(id);
      intervalRef.current = null;
    }
  };

  const startMeterLoop = (): void => {
    const sample = (): void => {
      const analyser = analyserRef.current;
      if (analyser === null) {
        return;
      }
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      setLevels(computeBands(data));
      rafRef.current = requestAnimationFrame(sample);
    };
    rafRef.current = requestAnimationFrame(sample);
  };

  const releaseStream = (): void => {
    const stream = streamRef.current;
    if (stream !== null) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const audioContext = audioContextRef.current;
    if (audioContext !== null && audioContext.state !== 'closed') {
      void audioContext.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  };

  const handleRecorderStop = (): void => {
    const recorder = recorderRef.current;
    const type =
      recorder !== null && recorder.mimeType !== ''
        ? recorder.mimeType
        : FALLBACK_MIME_TYPE;
    const blob = new Blob(chunksRef.current, { type });
    const durationSeconds = Math.floor(elapsedBaseRef.current / 1000);
    const resolveStop = stopResolveRef.current;
    stopResolveRef.current = null;
    releaseStream();
    setLevels(FLAT_LEVELS);
    setStatus('idle');
    if (resolveStop !== null) {
      resolveStop({ blob, durationSeconds, mimeType: type });
    }
  };

  const setupAnalyser = (stream: MediaStream): void => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
  };

  const requestStream = async (): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (streamError: unknown) {
      setError(
        isDeniedError(streamError) ? MIC_DENIED_MESSAGE : GENERIC_START_MESSAGE
      );
      return null;
    }
  };

  const start = async (): Promise<void> => {
    setError(null);
    const stream = await requestStream();
    if (stream === null) {
      return;
    }
    const recorder = createRecorder(stream);
    setupAnalyser(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event): void => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = handleRecorderStop;
    streamRef.current = stream;
    recorderRef.current = recorder;
    elapsedBaseRef.current = 0;
    segmentStartRef.current = Date.now();
    setElapsedSeconds(0);
    recorder.start(1000);
    intervalRef.current = setInterval(
      () => setElapsedSeconds(computeElapsedSeconds()),
      250
    );
    startMeterLoop();
    setStatus('recording');
  };

  const stop = (): Promise<RecordingResult> =>
    new Promise<RecordingResult>((resolve) => {
      const recorder = recorderRef.current;
      finalizeElapsed();
      stopMeterLoop();
      stopInterval();
      setLevels(FLAT_LEVELS);
      if (recorder === null || recorder.state === 'inactive') {
        resolve({
          blob: new Blob(chunksRef.current, { type: FALLBACK_MIME_TYPE }),
          durationSeconds: Math.floor(elapsedBaseRef.current / 1000),
          mimeType: FALLBACK_MIME_TYPE,
        });
        return;
      }
      stopResolveRef.current = resolve;
      recorder.stop();
    });

  const pause = (): void => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') {
      return;
    }
    recorder.pause();
    finalizeElapsed();
    stopMeterLoop();
    setLevels(FLAT_LEVELS);
    setStatus('paused');
  };

  const resume = (): void => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'paused') {
      return;
    }
    recorder.resume();
    segmentStartRef.current = Date.now();
    startMeterLoop();
    setStatus('recording');
  };

  useEffect((): (() => void) => {
    const teardown = (): void => {
      stopMeterLoop();
      stopInterval();
      const recorder = recorderRef.current;
      if (recorder !== null && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseStream();
    };
    return teardown;
  }, []);

  return {
    elapsedSeconds,
    error,
    levels,
    pause,
    resume,
    start,
    status,
    stop,
  };
};
