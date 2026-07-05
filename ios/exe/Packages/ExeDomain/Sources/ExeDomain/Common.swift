import Foundation

public typealias DateOnly = String
public typealias DateTime = String
public typealias SlackChannelID = String
public typealias SlackMessageTimestamp = String
public typealias SlackTeamID = String
public typealias SlackUserID = String
public typealias UserID = String
public typealias WorkspaceID = String

public enum ExeEnvironment: String, Codable, CaseIterable, Sendable {
    case dev
    case prod
}

public enum Language: String, Codable, CaseIterable, Sendable {
    case en
    case ja
}
