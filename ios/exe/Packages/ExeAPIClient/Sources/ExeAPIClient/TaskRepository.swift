import ExeDomain
import Foundation

public struct TaskRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func listWorkTasks(workspaceId: WorkspaceID) async throws -> [WorkTask] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/tasks",
                queryItems: [URLQueryItem(name: "scope", value: "mine")]
            )
        )
    }

    public func listRequestedWorkTasks(workspaceId: WorkspaceID) async throws -> [WorkTask] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/tasks",
                queryItems: [URLQueryItem(name: "scope", value: "requested")]
            )
        )
    }

    public func listFollowUpTasks(workspaceId: WorkspaceID) async throws -> [FollowUpTask] {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/tasks",
                queryItems: [URLQueryItem(name: "scope", value: "follow-ups-for-me")]
            )
        )
    }

    public func getTask(
        workspaceId: WorkspaceID,
        taskId: String
    ) async throws -> Task {
        try await apiClient.request(
            Endpoint(path: "/api/v1/workspaces/\(workspaceId)/tasks/\(taskId)")
        )
    }

    public func patchTask(
        workspaceId: WorkspaceID,
        patch: TaskPatch
    ) async throws -> Task {
        try await apiClient.request(
            Endpoint(
                path: "/api/v1/workspaces/\(workspaceId)/tasks/\(patch.taskId)",
                method: .patch,
                body: patch
            )
        )
    }
}
