import { createRequestApi } from '#app/server/api';
import { authenticateRequest } from '#app/server/auth';
import { reportServerError } from '#app/server/error-reporting';
import { invalidRequestError } from '@exe/server';
import type { ExeIosApi, AuthenticatedContext } from '@exe/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface SafeParseFailure {
  readonly success: false;
}

interface SafeParseSuccess<Value> {
  readonly data: Value;
  readonly success: true;
}

interface SafeParser<Value> {
  readonly safeParse: (
    value: unknown
  ) => SafeParseFailure | SafeParseSuccess<Value>;
}

interface HandlerParams {
  readonly api: ExeIosApi;
  readonly context: AuthenticatedContext;
}

const getErrorStatus = (error: unknown): number => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'httpStatus' in error &&
    typeof error.httpStatus === 'number'
  ) {
    return error.httpStatus;
  }

  return 500;
};

const isServerErrorStatus = (status: number): boolean => status >= 500;

const getErrorMessage = ({
  error,
  status,
}: {
  readonly error: unknown;
  readonly status: number;
}): string => {
  if (isServerErrorStatus(status)) {
    return 'Internal server error.';
  }

  return error instanceof Error ? error.message : 'Request failed.';
};

const handleRouteError = async ({
  error,
  request,
}: {
  readonly error: unknown;
  readonly request: NextRequest;
}): Promise<NextResponse> => {
  const status = getErrorStatus(error);

  if (isServerErrorStatus(status)) {
    await reportServerError({
      context: { route: request.nextUrl.pathname },
      error,
    });
  }

  return NextResponse.json(
    { error: { message: getErrorMessage({ error, status }) } },
    { status }
  );
};

export const handlePublicRoute = async <Value>(
  request: NextRequest,
  handler: () => Promise<Value>
): Promise<NextResponse> => {
  try {
    const result = await handler();

    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleRouteError({ error, request });
  }
};

export const handleAuthenticatedRoute = async <Value>(
  request: NextRequest,
  handler: (params: HandlerParams) => Promise<Value>
): Promise<NextResponse> => {
  try {
    const context = await authenticateRequest(request);
    const api = createRequestApi();
    const result = await handler({ api, context });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleRouteError({ error, request });
  }
};

const readJsonBody = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch (error: unknown) {
    void error;
    throw invalidRequestError('Request body must be valid JSON.');
  }
};

export const parseJsonBody = async <Value>({
  request,
  schema,
}: {
  readonly request: NextRequest;
  readonly schema: SafeParser<Value>;
}): Promise<Value> => {
  const body = await readJsonBody(request);
  const result = schema.safeParse(body);

  if (!result.success) {
    throw invalidRequestError('Request body is invalid.');
  }

  return result.data;
};
