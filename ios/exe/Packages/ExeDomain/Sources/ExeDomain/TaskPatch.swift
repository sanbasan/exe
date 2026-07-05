import Foundation

public struct WorkTaskPatch: Codable, Hashable, Sendable {
    public var assigneeSlackUserIds: [SlackUserID]?
    public var channelId: SlackChannelID?
    public var dueAt: DateTime?
    public var kind: TaskKind = .work
    public var requesterSlackUserIds: [SlackUserID]?
    public var status: TaskStatus?
    public var title: String?
    public private(set) var clearsDueAt = false

    public init() {}

    public mutating func clearDueAt() {
        dueAt = nil
        clearsDueAt = true
    }

    private enum CodingKeys: String, CodingKey {
        case assigneeSlackUserIds
        case channelId
        case dueAt
        case kind
        case requesterSlackUserIds
        case status
        case title
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        assigneeSlackUserIds = try container.decodeIfPresent([SlackUserID].self, forKey: .assigneeSlackUserIds)
        channelId = try container.decodeIfPresent(SlackChannelID.self, forKey: .channelId)
        dueAt = try container.decodeIfPresent(DateTime.self, forKey: .dueAt)
        kind = try container.decodeIfPresent(TaskKind.self, forKey: .kind) ?? .work
        requesterSlackUserIds = try container.decodeIfPresent([SlackUserID].self, forKey: .requesterSlackUserIds)
        status = try container.decodeIfPresent(TaskStatus.self, forKey: .status)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        clearsDueAt = try container.contains(.dueAt) && (container.decodeNil(forKey: .dueAt))
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(assigneeSlackUserIds, forKey: .assigneeSlackUserIds)
        try container.encodeIfPresent(channelId, forKey: .channelId)
        if clearsDueAt {
            try container.encodeNil(forKey: .dueAt)
        } else {
            try container.encodeIfPresent(dueAt, forKey: .dueAt)
        }
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(requesterSlackUserIds, forKey: .requesterSlackUserIds)
        try container.encodeIfPresent(status, forKey: .status)
        try container.encodeIfPresent(title, forKey: .title)
    }
}

public struct FollowUpTaskPatch: Codable, Hashable, Sendable {
    public var assigneeSlackUserIds: [SlackUserID]?
    public var followUpAnswer: String?
    public var followUpQuestion: String?
    public var channelId: SlackChannelID?
    public var kind: TaskKind = .followUp
    public var requesterSlackUserIds: [SlackUserID]?
    public var status: TaskStatus?
    public var title: String?

    public init() {}
}

public enum TaskPatchPayload: Codable, Hashable, Sendable {
    case followUp(FollowUpTaskPatch)
    case work(WorkTaskPatch)

    private enum CodingKeys: String, CodingKey {
        case kind
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(TaskKind.self, forKey: .kind)

        switch kind {
            case .followUp:
                self = try .followUp(FollowUpTaskPatch(from: decoder))
            case .work:
                self = try .work(WorkTaskPatch(from: decoder))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        switch self {
            case let .followUp(patch):
                try patch.encode(to: encoder)
            case let .work(patch):
                try patch.encode(to: encoder)
        }
    }
}

public struct TaskPatch: Codable, Hashable, Sendable {
    public let after: TaskPatchPayload
    public let before: TaskPatchPayload?
    public let draftId: String?
    public let taskId: String

    public init(
        after: TaskPatchPayload,
        before: TaskPatchPayload? = nil,
        draftId: String? = nil,
        taskId: String
    ) {
        self.after = after
        self.before = before
        self.draftId = draftId
        self.taskId = taskId
    }
}

public extension TaskPatch {
    static func status(
        task: Task,
        status: TaskStatus
    ) -> TaskPatch {
        switch task {
            case let .followUp(followUp):
                var after = FollowUpTaskPatch()
                after.status = status
                return TaskPatch(
                    after: .followUp(after),
                    before: .followUp(FollowUpTaskPatch.snapshot(task: followUp)),
                    taskId: followUp.id
                )
            case let .work(work):
                var after = WorkTaskPatch()
                after.status = status
                return TaskPatch(
                    after: .work(after),
                    before: .work(WorkTaskPatch.snapshot(task: work)),
                    taskId: work.id
                )
        }
    }
}

private extension WorkTaskPatch {
    static func snapshot(task: WorkTask) -> WorkTaskPatch {
        var patch = WorkTaskPatch()
        patch.assigneeSlackUserIds = task.assigneeSlackUserIds
        patch.channelId = task.channelId
        patch.dueAt = task.dueAt
        patch.requesterSlackUserIds = task.requesterSlackUserIds
        patch.status = task.status
        patch.title = task.title
        return patch
    }
}

private extension FollowUpTaskPatch {
    static func snapshot(task: FollowUpTask) -> FollowUpTaskPatch {
        var patch = FollowUpTaskPatch()
        patch.assigneeSlackUserIds = task.assigneeSlackUserIds
        patch.followUpAnswer = task.followUpAnswer
        patch.followUpQuestion = task.followUpQuestion
        patch.channelId = task.channelId
        patch.requesterSlackUserIds = task.requesterSlackUserIds
        patch.status = task.status
        patch.title = task.title
        return patch
    }
}

public struct FollowUpTaskDraft: Codable, Hashable, Sendable {
    public let assigneeSlackUserIds: [SlackUserID]?
    public let followUpQuestion: String
    public let channelId: SlackChannelID?
    public let draftId: String?
    public let requesterSlackUserIds: [SlackUserID]
    public let sourceTaskId: String?
    public let title: String
}

public struct WorkTaskDraft: Codable, Hashable, Sendable {
    public let assigneeSlackUserIds: [SlackUserID]
    public let channelId: SlackChannelID?
    public let draftId: String?
    public let dueAt: DateTime?
    public let requesterSlackUserIds: [SlackUserID]
    public let title: String
}
