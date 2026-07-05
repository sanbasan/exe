// swiftlint:disable discouraged_optional_boolean identifier_name
import Foundation

public struct SlackWorkspaceTeamIcon: Codable, Hashable, Sendable {
    public let image_34: String?
    public let image_44: String?
    public let image_68: String?
    public let image_88: String?
    public let image_102: String?
    public let image_132: String?
    public let image_230: String?
    public let image_default: Bool?
    public let image_original: String?
}

public struct SlackWorkspaceTeam: Codable, Hashable, Sendable {
    public let avatar_base_url: String?
    public let discoverable: String?
    public let domain: String?
    public let email_domain: String?
    public let enterprise_domain: String?
    public let enterprise_id: String?
    public let enterprise_name: String?
    public let icon: SlackWorkspaceTeamIcon?
    public let id: String?
    public let is_verified: Bool?
    public let lob_sales_home_enabled: Bool?
    public let name: String?
    public let url: String?
}

public struct SlackWorkspaceMemberEnterpriseUser: Codable, Hashable, Sendable {
    public let enterprise_id: String?
    public let enterprise_name: String?
    public let id: String?
    public let is_admin: Bool?
    public let is_owner: Bool?
    public let is_primary_owner: Bool?
    public let teams: [String]?
}

public struct SlackWorkspaceMemberStatusEmojiDisplayInfo: Codable, Hashable, Sendable {
    public let display_alias: String?
    public let display_url: String?
    public let emoji_name: String?
    public let unicode: String?
}

public struct SlackWorkspaceMemberProfile: Codable, Hashable, Sendable {
    public let always_active: Bool?
    public let api_app_id: String?
    public let avatar_hash: String?
    public let bot_id: String?
    public let display_name: String?
    public let display_name_normalized: String?
    public let email: String?
    public let first_name: String?
    public let guest_expiration_ts: Int?
    public let guest_invited_by: String?
    public let huddle_state: String?
    public let huddle_state_expiration_ts: Int?
    public let image_24: String?
    public let image_32: String?
    public let image_48: String?
    public let image_72: String?
    public let image_192: String?
    public let image_512: String?
    public let image_1024: String?
    public let image_original: String?
    public let is_custom_image: Bool?
    public let last_name: String?
    public let phone: String?
    public let pronouns: String?
    public let real_name: String?
    public let real_name_normalized: String?
    public let skype: String?
    public let status_emoji: String?
    public let status_emoji_display_info: [SlackWorkspaceMemberStatusEmojiDisplayInfo]?
    public let status_expiration: Int?
    public let status_text: String?
    public let status_text_canonical: String?
    public let team: String?
    public let title: String?
}

public struct SlackWorkspaceMember: Codable, Hashable, Identifiable, Sendable {
    public var id: String {
        slackId ?? email ?? name ?? "unknown"
    }

    public let color: String?
    public let deleted: Bool?
    public let enterprise_user: SlackWorkspaceMemberEnterpriseUser?
    public let has_2fa: Bool?
    public let is_admin: Bool?
    public let is_app_user: Bool?
    public let is_bot: Bool?
    public let is_connector_bot: Bool?
    public let is_email_confirmed: Bool?
    public let is_invited_user: Bool?
    public let is_owner: Bool?
    public let is_primary_owner: Bool?
    public let is_restricted: Bool?
    public let is_ultra_restricted: Bool?
    public let is_workflow_bot: Bool?
    public let locale: String?
    public let name: String?
    public let profile: SlackWorkspaceMemberProfile?
    public let real_name: String?
    public let slackId: String?
    public let team_id: String?
    public let two_factor_type: String?
    public let tz: String?
    public let tz_label: String?
    public let tz_offset: Int?
    public let updated: Int?
    public let who_can_share_contact_card: String?

    enum CodingKeys: String, CodingKey {
        case color
        case deleted
        case enterprise_user
        case has_2fa
        case is_admin
        case is_app_user
        case is_bot
        case is_connector_bot
        case is_email_confirmed
        case is_invited_user
        case is_owner
        case is_primary_owner
        case is_restricted
        case is_ultra_restricted
        case is_workflow_bot
        case locale
        case name
        case profile
        case real_name
        case slackId = "id"
        case team_id
        case two_factor_type
        case tz
        case tz_label
        case tz_offset
        case updated
        case who_can_share_contact_card
    }
}

public extension SlackWorkspaceMember {
    var displayName: String {
        let candidates = [
            profile?.display_name_normalized,
            profile?.display_name,
            profile?.real_name_normalized,
            profile?.real_name,
            real_name,
            name,
            profile?.email,
            slackId
        ]

        return candidates
            .compactMap(\.self)
            .first { !$0.isEmpty } ?? "Unknown user"
    }

    var email: String? {
        profile?.email
    }

    var avatarURL: URL? {
        [
            profile?.image_192,
            profile?.image_72,
            profile?.image_48,
            profile?.image_32,
            profile?.image_24,
            profile?.image_original
        ]
        .compactMap(\.self)
        .compactMap(URL.init(string:))
        .first
    }
}

public extension SlackWorkspaceTeam {
    var iconURL: URL? {
        [
            icon?.image_132,
            icon?.image_102,
            icon?.image_88,
            icon?.image_68,
            icon?.image_44,
            icon?.image_34,
            icon?.image_230,
            icon?.image_original
        ]
        .compactMap(\.self)
        .compactMap(URL.init(string:))
        .first
    }
}

// swiftlint:enable discouraged_optional_boolean identifier_name
