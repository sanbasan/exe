import Foundation

public enum DeviceTokenKind: String, Codable, CaseIterable, Sendable {
    case fcm
    case voip
}

public struct DeviceToken: Codable, Hashable, Identifiable, Sendable {
    public let createdAt: DateTime
    public let environment: ExeEnvironment
    public let id: String
    public let kind: DeviceTokenKind
    public let platform: String
    public let token: String
    public let updatedAt: DateTime
    public let userId: UserID
}
