import ExeDomain
import Foundation

public struct PatchChannelInput: Encodable, Sendable {
    public var assigneeSlackUserIds: [SlackUserID]?
    public var latestInfo: String?
    public var status: ChannelStatus?
    public var watcherSlackUserIds: [SlackUserID]?

    public init(
        assigneeSlackUserIds: [SlackUserID]? = nil,
        latestInfo: String? = nil,
        status: ChannelStatus? = nil,
        watcherSlackUserIds: [SlackUserID]? = nil
    ) {
        self.assigneeSlackUserIds = assigneeSlackUserIds
        self.latestInfo = latestInfo
        self.status = status
        self.watcherSlackUserIds = watcherSlackUserIds
    }
}

public struct PutWatchedChannelsInput: Encodable, Sendable {
    public let channelIds: [SlackChannelID]

    public init(channelIds: [SlackChannelID]) {
        self.channelIds = channelIds
    }
}

public struct CreateChannelBlockInput: Encodable, Sendable {
    public let description: String?
    public let title: String

    public init(title: String, description: String? = nil) {
        self.description = description
        self.title = title
    }
}

public struct UpdateChannelBlockInput: Encodable, Sendable {
    public let description: String?
    public let title: String?

    public init(title: String? = nil, description: String? = nil) {
        self.description = description
        self.title = title
    }
}

public struct RecordChannelReviewInput: Encodable, Sendable {
    public let lastSelfReport: String?
    public let nextCheckAt: DateTime?
    public let nextCheckReason: String?
    public let statusText: String?

    public init(
        lastSelfReport: String? = nil,
        nextCheckAt: DateTime? = nil,
        nextCheckReason: String? = nil,
        statusText: String? = nil
    ) {
        self.lastSelfReport = lastSelfReport
        self.nextCheckAt = nextCheckAt
        self.nextCheckReason = nextCheckReason
        self.statusText = statusText
    }
}

public struct ChannelRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func listChannels(workspaceId: WorkspaceID) async throws -> [Channel] {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/channels")
        )
    }

    public func listAssignedChannels(workspaceId: WorkspaceID) async throws -> [Channel] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channels",
                queryItems: [URLQueryItem(name: "scope", value: "assigned")]
            )
        )
    }

    public func listWatchedChannels(workspaceId: WorkspaceID) async throws -> [Channel] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channels",
                queryItems: [URLQueryItem(name: "scope", value: "watched")]
            )
        )
    }

    public func getChannel(
        workspaceId: WorkspaceID,
        channelId: SlackChannelID
    ) async throws -> Channel {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/channels/\(channelId)")
        )
    }

    public func listEvents(
        workspaceId: WorkspaceID,
        channelId: SlackChannelID
    ) async throws -> [ChannelEvent] {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/channels/\(channelId)/events")
        )
    }

    public func patchChannel(
        workspaceId: WorkspaceID,
        channelId: SlackChannelID,
        input: PatchChannelInput
    ) async throws -> Channel {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channels/\(channelId)",
                method: .patch,
                body: input
            )
        )
    }

    public func putWatchedChannels(
        workspaceId: WorkspaceID,
        channelIds: [SlackChannelID]
    ) async throws -> [Channel] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/watched-channels",
                method: .put,
                body: PutWatchedChannelsInput(channelIds: channelIds)
            )
        )
    }

    public func listBlocks(workspaceId: WorkspaceID) async throws -> [ChannelBlock] {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/channel-blocks")
        )
    }

    public func listReviewStates(workspaceId: WorkspaceID) async throws -> [ChannelReviewState] {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/channel-reviews")
        )
    }

    public func listChannelReviewStates(workspaceId: WorkspaceID) async throws -> [ChannelReviewState] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channel-reviews",
                queryItems: [URLQueryItem(name: "scope", value: "all")]
            )
        )
    }

    public func createBlock(
        workspaceId: WorkspaceID,
        channelId: SlackChannelID,
        input: CreateChannelBlockInput
    ) async throws -> ChannelBlock {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channels/\(channelId)/blocks",
                method: .post,
                body: input
            )
        )
    }

    public func resolveBlock(
        workspaceId: WorkspaceID,
        blockId: String
    ) async throws -> ChannelBlock {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channel-blocks/\(blockId)/resolve",
                method: .post
            )
        )
    }

    public func updateBlock(
        workspaceId: WorkspaceID,
        blockId: String,
        input: UpdateChannelBlockInput
    ) async throws -> ChannelBlock {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channel-blocks/\(blockId)",
                method: .patch,
                body: input
            )
        )
    }

    public func deleteBlock(
        workspaceId: WorkspaceID,
        blockId: String
    ) async throws -> ChannelBlock {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channel-blocks/\(blockId)",
                method: .delete
            )
        )
    }

    public func recordReview(
        workspaceId: WorkspaceID,
        channelId: SlackChannelID,
        input: RecordChannelReviewInput
    ) async throws -> ChannelReviewState {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/channels/\(channelId)/review",
                method: .post,
                body: input
            )
        )
    }
}
