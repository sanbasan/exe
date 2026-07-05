import Foundation

public struct LatestInfoDraft: Codable, Hashable, Sendable {
    public let channelId: SlackChannelID
    public let channelName: String
    public let draftId: String?
    public let latestInfo: String
}
