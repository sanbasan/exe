import ExeDomain
import Foundation

public struct DeviceTokenRepository: Sendable {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func register(
        token: String,
        kind: DeviceTokenKind,
        environment: ExeEnvironment
    ) async throws -> DeviceToken {
        struct Request: Encodable, Sendable {
            let environment: ExeEnvironment
            let kind: DeviceTokenKind
            let token: String
        }

        return try await apiClient.request(
            Endpoint(
                path: "/api/v1/device-tokens",
                method: .post,
                body: Request(environment: environment, kind: kind, token: token)
            )
        )
    }
}
