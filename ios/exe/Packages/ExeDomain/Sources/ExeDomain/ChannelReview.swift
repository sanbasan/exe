import Foundation

public enum ChannelBlockStatus: String, Codable, CaseIterable, Sendable {
    case active
    case resolved
}

public struct ChannelBlock: Codable, Hashable, Identifiable, Sendable {
    public let channelId: SlackChannelID
    public let createdAt: DateTime
    public let createdBySlackUserId: SlackUserID
    public let description: String
    public let id: String
    public let resolvedAt: DateTime?
    public let status: ChannelBlockStatus
    public let title: String
    public let updatedAt: DateTime
    public let workspaceId: WorkspaceID

    public init(
        channelId: SlackChannelID,
        createdAt: DateTime,
        createdBySlackUserId: SlackUserID,
        description: String,
        id: String,
        resolvedAt: DateTime?,
        status: ChannelBlockStatus,
        title: String,
        updatedAt: DateTime,
        workspaceId: WorkspaceID
    ) {
        self.channelId = channelId
        self.createdAt = createdAt
        self.createdBySlackUserId = createdBySlackUserId
        self.description = description
        self.id = id
        self.resolvedAt = resolvedAt
        self.status = status
        self.title = title
        self.updatedAt = updatedAt
        self.workspaceId = workspaceId
    }
}

public struct ChannelReviewState: Codable, Hashable, Identifiable, Sendable {
    public let channelId: SlackChannelID
    public let createdAt: DateTime
    public let id: String
    public let lastCheckedAt: DateTime?
    public let lastSelfReport: String?
    public let nextCheckAt: DateTime?
    public let nextCheckReason: String?
    public let slackUserId: SlackUserID
    public let statusText: String?
    public let statusUpdatedAt: DateTime?
    public let updatedAt: DateTime
    public let workspaceId: WorkspaceID

    public init(
        channelId: SlackChannelID,
        createdAt: DateTime,
        id: String,
        lastCheckedAt: DateTime?,
        lastSelfReport: String?,
        nextCheckAt: DateTime?,
        nextCheckReason: String?,
        slackUserId: SlackUserID,
        statusText: String?,
        statusUpdatedAt: DateTime?,
        updatedAt: DateTime,
        workspaceId: WorkspaceID
    ) {
        self.channelId = channelId
        self.createdAt = createdAt
        self.id = id
        self.lastCheckedAt = lastCheckedAt
        self.lastSelfReport = lastSelfReport
        self.nextCheckAt = nextCheckAt
        self.nextCheckReason = nextCheckReason
        self.slackUserId = slackUserId
        self.statusText = statusText
        self.statusUpdatedAt = statusUpdatedAt
        self.updatedAt = updatedAt
        self.workspaceId = workspaceId
    }
}

public struct ChannelReviewDraft: Codable, Hashable, Sendable {
    public let channelId: SlackChannelID
    public let channelName: String
    public let draftId: String?
    public let lastSelfReport: String?
    public let nextCheckAt: String?
    public let nextCheckReason: String?
    public let statusText: String
}

public enum ChannelBlockDraftAction: String, Codable, Hashable, Sendable {
    case create
    case delete
    case resolve
    case update
}

public struct ChannelBlockDraft: Codable, Hashable, Sendable {
    public let action: ChannelBlockDraftAction
    public let blockId: String?
    public let channelId: SlackChannelID
    public let channelName: String
    public let description: String?
    public let draftId: String?
    public let title: String?
}

public struct ChannelReviewAgendaItem: Codable, Hashable, Identifiable, Sendable {
    public var id: SlackChannelID {
        channel.channelId
    }

    public let activeBlocks: [ChannelBlock]
    public let assignedWorkTasks: [WorkTask]
    public let channel: Channel
    public let completedWorkTasksSinceLastCheck: [WorkTask]
    public let otherActiveWorkTasks: [WorkTask]
    public let reviewState: ChannelReviewState?

    public init(
        activeBlocks: [ChannelBlock],
        assignedWorkTasks: [WorkTask],
        channel: Channel,
        completedWorkTasksSinceLastCheck: [WorkTask],
        otherActiveWorkTasks: [WorkTask],
        reviewState: ChannelReviewState?
    ) {
        self.activeBlocks = activeBlocks
        self.assignedWorkTasks = assignedWorkTasks
        self.channel = channel
        self.completedWorkTasksSinceLastCheck = completedWorkTasksSinceLastCheck
        self.otherActiveWorkTasks = otherActiveWorkTasks
        self.reviewState = reviewState
    }
}
