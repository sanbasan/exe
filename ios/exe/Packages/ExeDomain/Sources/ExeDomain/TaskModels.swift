import Foundation

public enum TaskKind: String, Codable, CaseIterable, Sendable {
    case followUp = "follow_up"
    case work
}

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case active
    case blocked
    case cancelled
    case completed
}

public struct WorkTask: Codable, Hashable, Identifiable, Sendable {
    public let assigneeSlackUserIds: [SlackUserID]
    public let channelId: SlackChannelID?
    public let completedAt: DateTime?
    public let createdAt: DateTime
    public let dueAt: DateTime?
    public let id: String
    public let kind: TaskKind
    public let messageTs: SlackMessageTimestamp?
    public let requesterSlackUserIds: [SlackUserID]
    public let status: TaskStatus
    public let title: String
    public let updatedAt: DateTime
    public let workspaceId: WorkspaceID
}

public struct FollowUpTask: Codable, Hashable, Identifiable, Sendable {
    public let assigneeSlackUserIds: [SlackUserID]
    public let completedAt: DateTime?
    public let createdAt: DateTime
    public let followUpAnswer: String?
    public let followUpQuestion: String
    public let channelId: SlackChannelID?
    public let id: String
    public let kind: TaskKind
    public let messageTs: SlackMessageTimestamp?
    public let requesterSlackUserIds: [SlackUserID]
    public let sourceTaskId: String?
    public let status: TaskStatus
    public let title: String
    public let updatedAt: DateTime
    public let workspaceId: WorkspaceID
}

public enum Task: Codable, Hashable, Identifiable, Sendable {
    case followUp(FollowUpTask)
    case work(WorkTask)

    public var id: String {
        switch self {
            case let .followUp(task):
                task.id
            case let .work(task):
                task.id
        }
    }

    public var status: TaskStatus {
        switch self {
            case let .followUp(task):
                task.status
            case let .work(task):
                task.status
        }
    }

    public var title: String {
        switch self {
            case let .followUp(task):
                task.title
            case let .work(task):
                task.title
        }
    }

    private enum CodingKeys: String, CodingKey {
        case kind
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(TaskKind.self, forKey: .kind)

        switch kind {
            case .followUp:
                self = try .followUp(FollowUpTask(from: decoder))
            case .work:
                self = try .work(WorkTask(from: decoder))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        switch self {
            case let .followUp(task):
                try task.encode(to: encoder)
            case let .work(task):
                try task.encode(to: encoder)
        }
    }
}
