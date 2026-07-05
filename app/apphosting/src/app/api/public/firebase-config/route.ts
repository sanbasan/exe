import { readFirebaseWebAppConfigJson } from '#app/server/firebase-webapp-config';
import { handlePublicRoute } from '#app/server/http';
import { notFoundError } from '@exe/server';
import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Unknown keys are stripped; only the client-safe fields are returned.
const firebaseWebConfigSchema = z.object({
  apiKey: z.string().optional(),
  appId: z.string().optional(),
  authDomain: z.string().optional(),
  messagingSenderId: z.string().optional(),
  projectId: z.string().optional(),
});

export const GET = (request: NextRequest): Promise<NextResponse> =>
  handlePublicRoute(request, () => {
    const raw = readFirebaseWebAppConfigJson();

    if (raw === undefined) {
      throw notFoundError('Firebase web app config is not available.');
    }

    return Promise.resolve(firebaseWebConfigSchema.parse(JSON.parse(raw)));
  });
