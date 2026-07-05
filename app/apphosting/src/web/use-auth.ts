'use client';

import { onAuthChanged, type User } from '#app/web/firebase-client';
import { useEffect, useState } from 'react';

export interface AuthState {
  readonly loading: boolean;
  readonly user: User | null;
}

export const useAuth = (): AuthState => {
  const [state, setState] = useState<AuthState>({ loading: true, user: null });

  useEffect(() => {
    const unsubscribe = onAuthChanged({
      callback: (user) => {
        setState({ loading: false, user });
      },
    });
    return unsubscribe;
  }, []);

  return state;
};
