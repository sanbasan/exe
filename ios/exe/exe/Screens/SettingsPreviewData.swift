import ExeDomain
import Foundation

#if DEBUG
private struct SettingsPreviewPayload: Decodable {
    let channels: [Channel]
    let schedule: CallSchedule
    let workspace: Workspace
}

enum SettingsPreviewData {
    static let workspaceId: WorkspaceID = "W_DEV"
    static let adminWorkspace = payload.workspace
    static let callSchedule = payload.schedule
    static let channels = payload.channels
    static let slackTeam = decode(SlackWorkspaceTeam.self, from: slackTeamJSON)
    static let members = decode([SlackWorkspaceMember].self, from: membersJSON)
    static let composition = AppComposition(
        baseURL: previewURL("https://preview.invalid"),
        liveKitWsURL: previewURL("wss://preview.invalid")
    )

    static let userProfile = UserProfile(
        createdAt: "2026-06-01T00:00:00Z",
        displayName: "佐藤 沙奈",
        email: "sana@example.com",
        id: "USER_DEV",
        slackUsers: [
            LinkedSlackUser(
                slackTeamId: "T_DEV",
                slackUserId: "U_SANA",
                workspaceId: workspaceId
            )
        ],
        updatedAt: "2026-06-30T08:00:00Z",
        workspaceIds: [workspaceId]
    )

    static let memberWorkspace = Workspace(
        admin: WorkspaceAdmin(emails: ["owner@example.com"], slackUserIds: ["U_OWNER"]),
        botUserId: adminWorkspace.botUserId,
        canManageWorkspaceSettings: false,
        channelOwnerEditors: WorkspaceAdmin(emails: [], slackUserIds: []),
        hasAdmins: true,
        id: adminWorkspace.id,
        language: adminWorkspace.language,
        name: adminWorkspace.name,
        slackTeamId: adminWorkspace.slackTeamId,
        timezone: adminWorkspace.timezone
    )

    static let setupRequiredWorkspace = Workspace(
        admin: WorkspaceAdmin(emails: [], slackUserIds: []),
        botUserId: adminWorkspace.botUserId,
        canManageWorkspaceSettings: false,
        channelOwnerEditors: WorkspaceAdmin(emails: [], slackUserIds: []),
        hasAdmins: false,
        id: adminWorkspace.id,
        language: adminWorkspace.language,
        name: adminWorkspace.name,
        slackTeamId: adminWorkspace.slackTeamId,
        timezone: adminWorkspace.timezone
    )

    static let settingsAdminState = SettingsScreenPreviewState(
        slackTeam: slackTeam,
        workspace: adminWorkspace
    )
    static let settingsMemberState = SettingsScreenPreviewState(
        slackTeam: slackTeam,
        workspace: memberWorkspace
    )
    static let callScheduleState = CallScheduleSettingsPreviewState(schedule: callSchedule)
    static let accountAdminState = AccountManagementPreviewState(
        members: members,
        userProfile: userProfile,
        workspace: adminWorkspace
    )
    static let accountSetupState = AccountManagementPreviewState(
        userProfile: userProfile,
        workspace: setupRequiredWorkspace
    )
    static let accountPermissionDeniedState = AccountManagementPreviewState(
        userProfile: userProfile,
        workspace: memberWorkspace
    )
    static let channelsState = ChannelsScreenPreviewState(
        channels: channels,
        userProfile: userProfile,
        workspace: adminWorkspace
    )
    static let channelsMemberState = ChannelsScreenPreviewState(
        channels: channels,
        userProfile: userProfile,
        workspace: memberWorkspace
    )
    static let channelsEmptyState = ChannelsScreenPreviewState(
        channels: [],
        userProfile: userProfile,
        workspace: adminWorkspace
    )

    private static let payload = decode(
        SettingsPreviewPayload.self,
        from: WorkspaceHomePreviewFixture.loadedJSON
    )

    private static let slackTeamJSON = """
    {
      "id": "T_DEV",
      "name": "dev-exe",
      "domain": "dev-exe",
      "icon": {}
    }
    """

    private static let membersJSON = """
    [
      {
        "id": "U_SANA",
        "name": "sana",
        "real_name": "佐藤 沙奈",
        "profile": {
          "display_name": "佐藤 沙奈",
          "real_name": "佐藤 沙奈",
          "email": "sana@example.com"
        }
      },
      {
        "id": "U_KEN",
        "name": "ken",
        "real_name": "山田 健",
        "profile": {
          "display_name": "山田 健",
          "real_name": "山田 健",
          "email": "ken@example.com"
        }
      },
      {
        "id": "U_MIKA",
        "name": "mika",
        "real_name": "田中 美香",
        "profile": {
          "display_name": "田中 美香",
          "real_name": "田中 美香",
          "email": "mika@example.com"
        }
      },
      {
        "id": "U_OWNER",
        "name": "owner",
        "real_name": "管理者",
        "profile": {
          "display_name": "管理者",
          "real_name": "管理者",
          "email": "owner@example.com"
        }
      }
    ]
    """

    private static func decode<Value: Decodable>(_ type: Value.Type, from json: String) -> Value {
        guard let data = json.data(using: .utf8) else {
            fatalError("Settings preview JSON is not UTF-8.")
        }

        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            fatalError("Settings preview JSON failed to decode: \(error)")
        }
    }

    private static func previewURL(_ value: String) -> URL {
        guard let url = URL(string: value) else {
            fatalError("Settings preview URL is invalid: \(value)")
        }

        return url
    }
}
#endif
