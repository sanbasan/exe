import Foundation

/// Status of a completed GBrain (workspace long-term memory) search.
public enum GBrainCallSearchStatus: String, Codable, Hashable, Sendable {
    case error
    case ok
}

/// A single hit returned by a GBrain search. Still received over the wire but no
/// longer surfaced in the UI (raw slug/snippet is meaningless to humans).
public struct GBrainCallSearchResultItem: Codable, Hashable, Sendable {
    public let slug: String
    public let snippet: String?

    public init(slug: String, snippet: String? = nil) {
        self.slug = slug
        self.snippet = snippet
    }
}

/// Payload for the `gbrain_search_started` data-channel message.
public struct GBrainCallSearchStarted: Codable, Hashable, Sendable {
    public let id: String
    public let lookupId: String?
    public let query: String
    public let channelId: SlackChannelID?

    public init(id: String, lookupId: String? = nil, query: String, channelId: SlackChannelID? = nil) {
        self.id = id
        self.lookupId = lookupId
        self.query = query
        self.channelId = channelId
    }
}

/// Payload for the `gbrain_search_completed` data-channel message.
public struct GBrainCallSearchCompleted: Codable, Hashable, Sendable {
    public let id: String
    public let lookupId: String?
    public let query: String
    public let channelId: SlackChannelID?
    public let status: GBrainCallSearchStatus
    public let results: [GBrainCallSearchResultItem]

    public init(
        id: String,
        lookupId: String? = nil,
        query: String,
        channelId: SlackChannelID? = nil,
        status: GBrainCallSearchStatus,
        results: [GBrainCallSearchResultItem]
    ) {
        self.id = id
        self.lookupId = lookupId
        self.query = query
        self.channelId = channelId
        self.status = status
        self.results = results
    }
}

/// Payload for the `gbrain_lookup_findings` data-channel message: the search
/// agent's human-readable digest of what one lookup (1+ searches) turned up.
public struct GBrainCallLookupFindings: Codable, Hashable, Sendable {
    public let lookupId: String
    public let channelId: SlackChannelID?
    public let bullets: [String]

    public init(lookupId: String, channelId: SlackChannelID? = nil, bullets: [String]) {
        self.lookupId = lookupId
        self.channelId = channelId
        self.bullets = bullets
    }
}

/// UI-facing model tracking one GBrain lookup (a single agent run that may fire
/// 1+ searches) over its lifecycle. One card per lookup; searches sharing a
/// `lookupId` collapse into the same activity.
public struct GBrainCallLookupActivity: Identifiable, Hashable, Sendable {
    public enum State: Hashable, Sendable {
        case searching
        case ok
        case error
    }

    public struct Search: Hashable, Sendable {
        public let id: String
        public let query: String
        public var state: State

        public init(id: String, query: String, state: State) {
            self.id = id
            self.query = query
            self.state = state
        }
    }

    public let id: String
    public var channelId: SlackChannelID?
    public var searches: [Search]
    public var bullets: [String]?

    public init(
        id: String,
        channelId: SlackChannelID? = nil,
        searches: [Search] = [],
        bullets: [String]? = nil
    ) {
        self.id = id
        self.channelId = channelId
        self.searches = searches
        self.bullets = bullets
    }
}
