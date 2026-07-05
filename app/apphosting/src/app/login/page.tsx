'use client';

import {
  isApiError,
  sendLoginCode,
  verifyLoginCode,
} from '#app/web/api-client';
import { signInWithCustomTokenHelper } from '#app/web/firebase-client';
import { Spinner } from '#app/web/spinner';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SyntheticEvent } from 'react';

const errorMessage = (error: unknown, fallback: string): string => {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return fallback;
};

const fieldClass =
  'w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

const buttonClass =
  'flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60';

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const [phase, setPhase] = useState<'code' | 'email'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async (): Promise<void> => {
    const trimmed = email.trim();
    if (trimmed === '') {
      setError('Enter your work email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendLoginCode({ email: trimmed });
      setEmail(trimmed);
      setPhase('code');
    } catch (caught: unknown) {
      setError(errorMessage(caught, 'Could not send the code. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (): Promise<void> => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await verifyLoginCode({ code: trimmed, email });
      await signInWithCustomTokenHelper({ token });
      router.replace('/');
    } catch (caught: unknown) {
      setError(errorMessage(caught, 'That code did not work. Try again.'));
      setBusy(false);
    }
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void (phase === 'email' ? submitEmail() : submitCode());
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white/90 p-8 shadow-xl backdrop-blur">
        <p className="text-center text-3xl font-bold lowercase tracking-tight text-accent">
          exe
        </p>
        <p className="mt-2 text-center text-sm text-muted">
          {phase === 'email'
            ? 'Sign in with your Slack workspace email.'
            : `We sent a 6-digit code to ${email}.`}
        </p>
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          {phase === 'email' ? (
            <input
              autoComplete="email"
              autoFocus
              className={fieldClass}
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              placeholder="you@company.com"
              type="email"
              value={email}
            />
          ) : (
            <input
              autoComplete="one-time-code"
              autoFocus
              className={`${fieldClass} text-center text-lg tracking-[0.5em]`}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/gu, ''));
              }}
              placeholder="000000"
              value={code}
            />
          )}
          {error !== null ? (
            <p className="text-sm text-danger">{error}</p>
          ) : null}
          <button className={buttonClass} disabled={busy} type="submit">
            {busy ? <Spinner /> : null}
            {phase === 'email' ? 'Send code' : 'Verify & continue'}
          </button>
        </form>
        {phase === 'code' ? (
          <button
            className="mt-4 w-full text-center text-sm text-muted underline-offset-2 hover:underline"
            onClick={() => {
              setPhase('email');
              setCode('');
              setError(null);
            }}
            type="button"
          >
            Use a different email
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default LoginPage;
