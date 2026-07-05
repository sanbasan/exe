import ExeDomain
import Foundation

public struct WorkspaceAccountsInput: Encodable, Sendable {
    public let adminSlackUserIds: [SlackUserID]
    public let channelOwnerEditorSlackUserIds: [SlackUserID]

    public init(
        adminSlackUserIds: [SlackUserID],
        channelOwnerEditorSlackUserIds: [SlackUserID]
    ) {
        self.adminSlackUserIds = adminSlackUserIds
        self.channelOwnerEditorSlackUserIds = channelOwnerEditorSlackUserIds
    }
}

public struct WorkspaceAdminInput: Encodable, Sendable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct WorkspaceRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func getMe() async throws -> UserProfile {
        try await apiClient.request(Endpoint(path: "/api/v1/me"))
    }

    public func listWorkspaces() async throws -> [Workspace] {
        try await apiClient.request(Endpoint(path: "/api/v1/workspaces"))
    }

    public func getSlackTeam(workspaceId: WorkspaceID) async throws -> SlackWorkspaceTeam? {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/slack-team")
        )
    }

    public func listSlackMembers(workspaceId: WorkspaceID) async throws -> [SlackWorkspaceMember] {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/slack-members")
        )
    }

    public func putAccounts(
        workspaceId: WorkspaceID,
        input: WorkspaceAccountsInput
    ) async throws -> Workspace {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/accounts",
                method: .put,
                body: input
            )
        )
    }

    public func registerFirstAdmin(workspaceId: WorkspaceID) async throws -> Workspace {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/admins/first",
                method: .post
            )
        )
    }

    public func addAdmin(
        workspaceId: WorkspaceID,
        email: String
    ) async throws -> Workspace {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/admins",
                method: .post,
                body: WorkspaceAdminInput(email: email)
            )
        )
    }

    public func deleteAdmin(
        workspaceId: WorkspaceID,
        email: String
    ) async throws -> Workspace {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/admins/delete",
                method: .post,
                body: WorkspaceAdminInput(email: email)
            )
        )
    }
}
