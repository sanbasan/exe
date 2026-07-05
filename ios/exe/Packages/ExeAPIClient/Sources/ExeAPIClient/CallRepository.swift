import ExeDomain
import Foundation

public struct PutCallScheduleInput: Encodable, Sendable {
    public var enabled: Bool = true
    public var excludedDates: [DateOnly] = []
    public var preNotifyMinutes: Int = 10
    public var timeOfDay: String = "09:00"
    public var timezone: String = "Asia/Tokyo"
    public var weekdays: [Int] = [1, 2, 3, 4, 5]

    public init() {}
}

public enum ManualReviewCallMode: String, Encodable, Sendable {
    case auto
    case manualReview = "manual_review"
    case scheduledReview = "scheduled_review"
}

public struct RecordCallEventInput: Sendable {
    public let callSessionId: String
    public let payload: CallEventPayload
    public let type: CallEventType
    public let workspaceId: WorkspaceID
}

public extension RecordCallEventInput {
    static func approvedDrafts(
        workspaceId: WorkspaceID,
        callSessionId: String,
        drafts: [FollowUpTaskDraft]
    ) -> RecordCallEventInput {
        RecordCallEventInput(
            callSessionId: callSessionId,
            payload: .drafts(drafts),
            type: .followUpTaskDraftApproved,
            workspaceId: workspaceId
        )
    }

    static func approvedPatches(
        workspaceId: WorkspaceID,
        callSessionId: String,
        patches: [TaskPatch]
    ) -> RecordCallEventInput {
        RecordCallEventInput(
            callSessionId: callSessionId,
            payload: .patches(patches),
            type: .taskPatchApproved,
            workspaceId: workspaceId
        )
    }

    static func approvedWorkTaskDrafts(
        workspaceId: WorkspaceID,
        callSessionId: String,
        drafts: [WorkTaskDraft]
    ) -> RecordCallEventInput {
        RecordCallEventInput(
            callSessionId: callSessionId,
            payload: .workTaskDrafts(drafts),
            type: .workTaskDraftApproved,
            workspaceId: workspaceId
        )
    }
}

public struct CallRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func getSchedule(workspaceId: WorkspaceID) async throws -> CallSchedule {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/call-schedule")
        )
    }

    public func putSchedule(
        workspaceId: WorkspaceID,
        input: PutCallScheduleInput
    ) async throws -> CallSchedule {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/call-schedule",
                method: .put,
                body: input
            )
        )
    }

    public func startManualReviewCall(
        workspaceId: WorkspaceID,
        mode: ManualReviewCallMode = .auto
    ) async throws -> CallSessionWithAgenda {
        struct Request: Encodable, Sendable {
            let mode: ManualReviewCallMode
        }
        return try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/call-sessions",
                method: .post,
                body: Request(mode: mode)
            )
        )
    }

    public func getSession(
        workspaceId: WorkspaceID,
        callSessionId: String
    ) async throws -> CallSession {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/call-sessions/\(callSessionId)")
        )
    }

    public func transitionSession(
        workspaceId: WorkspaceID,
        callSessionId: String,
        status: CallStatus
    ) async throws -> CallSession {
        struct Request: Encodable, Sendable {
            let status: CallStatus
        }
        return try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/call-sessions/\(callSessionId)",
                method: .patch,
                body: Request(status: status)
            )
        )
    }

    public func recordEvent(_ input: RecordCallEventInput) async throws -> CallEvent {
        struct Request: Encodable, Sendable {
            let payload: CallEventPayload
            let type: CallEventType
        }
        return try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(input.workspaceId)/call-sessions/\(input.callSessionId)/events",
                method: .post,
                body: Request(payload: input.payload, type: input.type)
            )
        )
    }
}
