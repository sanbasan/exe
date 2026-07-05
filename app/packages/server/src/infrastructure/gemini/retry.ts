const primaryMaxAttempts = 3;
const baseBackoffMs = 1000;
const maxJitterMs = 250;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const backoffDelayMs = (attempt: number): number =>
  baseBackoffMs * 2 ** attempt + Math.floor(Math.random() * maxJitterMs);

const runWithRetry = <T>({
  attempt,
  isTransient,
  model,
  run,
  sleep,
}: {
  readonly attempt: number;
  readonly isTransient: (error: unknown) => boolean;
  readonly model: string;
  readonly run: (model: string) => Promise<T>;
  readonly sleep: (ms: number) => Promise<void>;
}): Promise<T> =>
  run(model).catch(async (error: unknown) => {
    if (!isTransient(error) || attempt >= primaryMaxAttempts - 1) {
      throw error;
    }

    await sleep(backoffDelayMs(attempt));

    return runWithRetry({
      attempt: attempt + 1,
      isTransient,
      model,
      run,
      sleep,
    });
  });

export const runWithModelFallback = <T>({
  isTransient,
  models,
  onFallback,
  run,
  sleep = defaultSleep,
}: {
  readonly isTransient: (error: unknown) => boolean;
  readonly models: readonly string[];
  readonly onFallback?: (model: string) => void;
  readonly run: (model: string) => Promise<T>;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<T> => {
  const [primaryModel, ...fallbackModels] = models;

  if (primaryModel === undefined) {
    return Promise.reject(
      new Error('runWithModelFallback requires at least one model')
    );
  }

  return runWithRetry({
    attempt: 0,
    isTransient,
    model: primaryModel,
    run,
    sleep,
  }).catch((error: unknown) => {
    const fallbackModel = fallbackModels.find(
      (candidate) => candidate !== primaryModel
    );

    if (fallbackModel === undefined || !isTransient(error)) {
      throw error;
    }

    onFallback?.(fallbackModel);

    return run(fallbackModel);
  });
};
