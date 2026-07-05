import Foundation

public enum ChannelStatus: String, Codable, CaseIterable, Sendable {
    case active
    case archived
}

public enum ChannelEventSource: String, Codable, CaseIterable, Sendable {
    case call
    case manual
    case slack
    case system
}

public enum ChannelEventType: String, Codable, CaseIterable, Sendable {
    case callSummary = "call_summary"
    case channelMetadataUpdated = "channel_metadata_updated"
    case externalSummary = "external_summary"
    case followUpTaskAnswered = "follow_up_task_answered"
    case taskCreated = "task_created"
    case taskUpdated = "task_updated"
}

public struct Channel: Codable, Hashable, Identifiable, Sendable {
    public var id: SlackChannelID {
        channelId
    }

    public let assigneeSlackUserIds: [SlackUserID]
    public let channelId: SlackChannelID
    public let createdAt: DateTime
    public let createdBySlackUserId: SlackUserID
    public let latestInfo: String?
    public let latestInfoUpdatedAt: DateTime?
    public let name: String
    public let status: ChannelStatus
    public let updatedAt: DateTime
    public let watcherSlackUserIds: [SlackUserID]
    public let workspaceId: WorkspaceID
}

public struct ChannelEvent: Codable, Hashable, Identifiable, Sendable {
    public let body: String?
    public let channelId: SlackChannelID
    public let createdAt: DateTime
    public let id: String
    public let occurredAt: DateTime
    public let source: ChannelEventSource
    public let sourceRef: String?
    public let title: String
    public let type: ChannelEventType
    public let workspaceId: WorkspaceID
}
