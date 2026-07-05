import type {
  CallAgenda,
  CallEvent,
  CallEventPayload,
  CallEventType,
  CallSchedule,
  CallSession,
  CallStatus,
  CallTrigger,
} from '@exe/domain';

export interface CallSessionWithAgenda {
  readonly agenda: CallAgenda;
  readonly session: CallSession;
}

export interface CallSessionService {
  readonly activateCall: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
  readonly createManualReviewCall: (params: {
    readonly focusTaskId?: string;
    readonly mode?: 'auto' | 'manual_review' | 'scheduled_review';
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSessionWithAgenda>;
  // Creates a session for a server-initiated (automatically triggered) call.
  // The caller is responsible for transitioning it to 'ringing' and sending
  // the VoIP push.
  readonly createOutboundCall: (params: {
    readonly focusTaskId?: string;
    readonly trigger: CallTrigger;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSessionWithAgenda>;
  readonly createScheduledReviewCall: (params: {
    readonly schedule: CallSchedule;
    readonly scheduledRunAt?: string;
  }) => Promise<CallSessionWithAgenda>;
  readonly getAgendaForSession: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallAgenda>;
  readonly getById: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
  readonly getForUser: (params: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
  readonly listEvents: (params: {
    readonly callSessionId: string;
    readonly workspaceId: string;
  }) => Promise<readonly CallEvent[]>;
  readonly listEventsForUser: (params: {
    readonly callSessionId: string;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<readonly CallEvent[]>;
  readonly recordEvent: (params: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly workspaceId: string;
  }) => Promise<CallEvent>;
  readonly recordEventForUser: (params: {
    readonly callSessionId: string;
    readonly payload: CallEventPayload;
    readonly type: CallEventType;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallEvent>;
  readonly transitionCall: (params: {
    readonly callSessionId: string;
    readonly status: CallStatus;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
  readonly transitionCallForUser: (params: {
    readonly callSessionId: string;
    readonly status: CallStatus;
    readonly userId: string;
    readonly workspaceId: string;
  }) => Promise<CallSession>;
}
