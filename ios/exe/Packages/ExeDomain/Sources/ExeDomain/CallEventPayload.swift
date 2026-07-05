import Foundation

public enum CallEventPayload: Codable, Hashable, Sendable {
    case drafts([FollowUpTaskDraft])
    case patches([TaskPatch])
    case summary(String)
    case text(String)
    case workTaskDrafts([WorkTaskDraft])

    private enum CodingKeys: String, CodingKey {
        case drafts
        case patches
        case summary
        case text
        case workTaskDrafts
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if container.contains(.drafts) {
            self = try .drafts(container.decode([FollowUpTaskDraft].self, forKey: .drafts))
        } else if container.contains(.patches) {
            self = try .patches(container.decode([TaskPatch].self, forKey: .patches))
        } else if container.contains(.summary) {
            self = try .summary(container.decode(String.self, forKey: .summary))
        } else if container.contains(.text) {
            self = try .text(container.decode(String.self, forKey: .text))
        } else if container.contains(.workTaskDrafts) {
            self = try .workTaskDrafts(container.decode([WorkTaskDraft].self, forKey: .workTaskDrafts))
        } else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Unknown call event payload.")
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
            case let .drafts(drafts):
                try container.encode(drafts, forKey: .drafts)
            case let .patches(patches):
                try container.encode(patches, forKey: .patches)
            case let .summary(summary):
                try container.encode(summary, forKey: .summary)
            case let .text(text):
                try container.encode(text, forKey: .text)
            case let .workTaskDrafts(workTaskDrafts):
                try container.encode(workTaskDrafts, forKey: .workTaskDrafts)
        }
    }
}

public struct CallEvent: Codable, Hashable, Identifiable, Sendable {
    public let callSessionId: String
    public let createdAt: DateTime
    public let id: String
    public let payload: CallEventPayload
    public let type: CallEventType
    public let workspaceId: WorkspaceID
}
