export type ServerErrorCode =
  | 'conflict'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'unauthenticated';

export interface ExeServerError extends Error {
  readonly code: ServerErrorCode;
  readonly httpStatus: number;
  readonly name: 'ExeServerError';
}

export const createServerError = ({
  code,
  httpStatus,
  message,
}: {
  readonly code: ServerErrorCode;
  readonly httpStatus: number;
  readonly message: string;
}): ExeServerError =>
  Object.assign(new Error(message), {
    code,
    httpStatus,
    name: 'ExeServerError' as const,
  });

export const conflictError = (message: string): ExeServerError =>
  createServerError({ code: 'conflict', httpStatus: 409, message });

export const forbiddenError = (message: string): ExeServerError =>
  createServerError({ code: 'forbidden', httpStatus: 403, message });

export const invalidRequestError = (message: string): ExeServerError =>
  createServerError({ code: 'invalid_request', httpStatus: 400, message });

export const notFoundError = (message: string): ExeServerError =>
  createServerError({ code: 'not_found', httpStatus: 404, message });

export const unauthenticatedError = (message: string): ExeServerError =>
  createServerError({ code: 'unauthenticated', httpStatus: 401, message });
