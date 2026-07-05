import Foundation

public struct WorkspaceAdmin: Codable, Hashable, Sendable {
    public let emails: [String]
    public let slackUserIds: [SlackUserID]

    public init(
        emails: [String],
        slackUserIds: [SlackUserID]
    ) {
        self.emails = emails
        self.slackUserIds = slackUserIds
    }
}

public struct Workspace: Codable, Hashable, Identifiable, Sendable {
    public let admin: WorkspaceAdmin
    public let canManageWorkspaceSettings: Bool
    public let channelOwnerEditors: WorkspaceAdmin
    public let hasAdmins: Bool
    public let botUserId: SlackUserID
    public let id: WorkspaceID
    public let language: Language
    public let name: String
    public let slackTeamId: SlackTeamID
    public let timezone: String

    public init(
        admin: WorkspaceAdmin,
        botUserId: SlackUserID,
        canManageWorkspaceSettings: Bool,
        channelOwnerEditors: WorkspaceAdmin,
        hasAdmins: Bool,
        id: WorkspaceID,
        language: Language,
        name: String,
        slackTeamId: SlackTeamID,
        timezone: String
    ) {
        self.admin = admin
        self.botUserId = botUserId
        self.canManageWorkspaceSettings = canManageWorkspaceSettings
        self.channelOwnerEditors = channelOwnerEditors
        self.hasAdmins = hasAdmins
        self.id = id
        self.language = language
        self.name = name
        self.slackTeamId = slackTeamId
        self.timezone = timezone
    }
}
