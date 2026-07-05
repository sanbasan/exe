import ExeDomain
import Foundation

public struct LiveKitTokenResponse: Decodable, Hashable, Sendable {
    public let session: CallSession
    public let token: String
}

public struct LiveKitTokenRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func createToken(
        workspaceId: WorkspaceID,
        callSessionId: String
    ) async throws -> LiveKitTokenResponse {
        struct Request: Encodable, Sendable {
            let callSessionId: String
            let workspaceId: WorkspaceID
        }

        return try await apiClient.request(
            Endpoint(
                path: "/api/livekit/token",
                method: .post,
                body: Request(callSessionId: callSessionId, workspaceId: workspaceId)
            )
        )
    }

    public func ensureAgent(
        workspaceId: WorkspaceID,
        callSessionId: String
    ) async throws -> CallSession {
        struct Request: Encodable, Sendable {
            let callSessionId: String
            let workspaceId: WorkspaceID
        }

        struct Response: Decodable, Sendable {
            let session: CallSession
        }

        let response: Response = try await apiClient.request(
            Endpoint(
                path: "/api/livekit/ensure-agent",
                method: .post,
                body: Request(callSessionId: callSessionId, workspaceId: workspaceId)
            )
        )
        return response.session
    }
}
