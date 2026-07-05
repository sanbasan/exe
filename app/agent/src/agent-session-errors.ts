// AgentSession.generateReply throws this the moment the session has closed.
// Callers that inject speech asynchronously (assistant-job notices, silence
// nudges) race the user hanging up by design, so this error is expected and
// benign there — it must be swallowed, not reported, or every call that ends
// with an in-flight job spams Sentry. Anything else is a real failure.
export const isAgentSessionNotRunningError = (error: unknown): boolean =>
  error instanceof Error && error.message === 'AgentSession is not running';
