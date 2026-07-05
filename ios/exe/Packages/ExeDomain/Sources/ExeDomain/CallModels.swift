import Foundation

public enum CallPurpose: String, Codable, CaseIterable, Sendable {
    case followUpTask = "follow_up_task"
    case manualReview = "manual_review"
    case scheduledReview = "scheduled_review"
}

public enum CallStatus: String, Codable, CaseIterable, Sendable {
    case active
    case created
    case ended
    case failed
    case missed
    case ringing
    case skipped
}

public enum CallEventType: String, Codable, CaseIterable, Sendable {
    case agentMessage = "agent_message"
    case followUpTaskDraftApproved = "follow_up_task_draft_approved"
    case followUpTaskDraftProposed = "follow_up_task_draft_proposed"
    case summary
    case taskPatchApplied = "task_patch_applied"
    case taskPatchApproved = "task_patch_approved"
    case taskPatchProposed = "task_patch_proposed"
    case transcript
    case workTaskDraftApproved = "work_task_draft_approved"
    case workTaskDraftProposed = "work_task_draft_proposed"
}

public struct CallSchedule: Codable, Hashable, Identifiable, Sendable {
    public let createdAt: DateTime
    public let enabled: Bool
    public let excludedDates: [DateOnly]
    public let id: String
    public let nextRunAt: DateTime?
    public let preNotifyMinutes: Int
    public let timeOfDay: String
    public let timezone: String
    public let updatedAt: DateTime
    public let userId: UserID
    public let weekdays: [Int]
    public let workspaceId: WorkspaceID
}

public struct CallSession: Codable, Hashable, Identifiable, Sendable {
    public let callScheduleId: String?
    public let createdAt: DateTime
    public let endedAt: DateTime?
    public let id: String
    public let liveKitRoomName: String
    public let purpose: CallPurpose
    public let scheduledRunAt: DateTime?
    public let startedAt: DateTime?
    public let status: CallStatus
    public let summary: String?
    public let updatedAt: DateTime
    public let userId: UserID
    public let workspaceId: WorkspaceID
}

public struct ChannelOpenWorkTasks: Codable, Hashable, Sendable {
    public let channel: Channel
    public let openWorkTasks: [WorkTask]
}

public struct CallAgenda: Codable, Hashable, Sendable {
    public let channelOpenWorkTasks: [ChannelOpenWorkTasks]
    public let channels: [Channel]
    public let channelReviews: [ChannelReviewAgendaItem]
    public let followUpTasks: [FollowUpTask]
    public let language: Language
    public let now: String
    public let purpose: CallPurpose
    public let slackUserId: SlackUserID
    public let timezone: String
    public let workTasks: [WorkTask]
}

public struct CallSessionWithAgenda: Codable, Hashable, Sendable {
    public let agenda: CallAgenda
    public let session: CallSession
}
