import Foundation

public struct LinkedSlackUser: Codable, Hashable, Sendable {
    public let slackTeamId: SlackTeamID
    public let slackUserId: SlackUserID
    public let workspaceId: WorkspaceID

    public init(
        slackTeamId: SlackTeamID,
        slackUserId: SlackUserID,
        workspaceId: WorkspaceID
    ) {
        self.slackTeamId = slackTeamId
        self.slackUserId = slackUserId
        self.workspaceId = workspaceId
    }
}

public struct UserProfile: Codable, Hashable, Identifiable, Sendable {
    public let createdAt: DateTime
    public let displayName: String?
    public let email: String
    public let id: UserID
    public let slackUsers: [LinkedSlackUser]
    public let updatedAt: DateTime
    public let workspaceIds: [WorkspaceID]

    public init(
        createdAt: DateTime,
        displayName: String?,
        email: String,
        id: UserID,
        slackUsers: [LinkedSlackUser],
        updatedAt: DateTime,
        workspaceIds: [WorkspaceID]
    ) {
        self.createdAt = createdAt
        self.displayName = displayName
        self.email = email
        self.id = id
        self.slackUsers = slackUsers
        self.updatedAt = updatedAt
        self.workspaceIds = workspaceIds
    }
}
