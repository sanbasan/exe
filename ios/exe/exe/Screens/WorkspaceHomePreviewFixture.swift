import Foundation

#if DEBUG
enum WorkspaceHomePreviewFixture {
    static let loadedJSON = """
    {
      "workspace": {
        "admin": { "emails": ["sana@example.com"], "slackUserIds": ["U_SANA"] },
        "botUserId": "U_BOT",
        "canManageWorkspaceSettings": true,
        "channelOwnerEditors": { "emails": [], "slackUserIds": ["U_SANA", "U_KEN"] },
        "hasAdmins": true,
        "id": "W_DEV",
        "language": "ja",
        "name": "dev-exe",
        "slackTeamId": "T_DEV",
        "timezone": "Asia/Tokyo"
      },
      "schedule": {
        "createdAt": "2026-06-01T00:00:00Z",
        "enabled": true,
        "excludedDates": [],
        "id": "S_DEV",
        "nextRunAt": "2026-07-01T10:24:00Z",
        "preNotifyMinutes": 10,
        "timeOfDay": "19:24",
        "timezone": "Asia/Tokyo",
        "updatedAt": "2026-06-30T08:00:00Z",
        "userId": "USER_DEV",
        "weekdays": [1, 2, 3, 4, 5],
        "workspaceId": "W_DEV"
      },
      "workTasks": [
        {
          "assigneeSlackUserIds": ["U_SANA"],
          "channelId": "C_DEV",
          "completedAt": null,
          "createdAt": "2026-06-28T02:00:00Z",
          "dueAt": "2026-07-01T10:24:00Z",
          "id": "T_FOCUS",
          "kind": "work",
          "messageTs": null,
          "requesterSlackUserIds": ["U_KEN"],
          "status": "active",
          "title": "Improve focus by using push-to-talk",
          "updatedAt": "2026-06-30T08:00:00Z",
          "workspaceId": "W_DEV"
        },
        {
          "assigneeSlackUserIds": ["U_SANA"],
          "channelId": "C_OPS",
          "completedAt": "2026-06-29T11:00:00Z",
          "createdAt": "2026-06-27T02:00:00Z",
          "dueAt": null,
          "id": "T_PREVIEW",
          "kind": "work",
          "messageTs": null,
          "requesterSlackUserIds": ["U_MIKA"],
          "status": "completed",
          "title": "カード単体の Preview を追加",
          "updatedAt": "2026-06-29T11:00:00Z",
          "workspaceId": "W_DEV"
        }
      ],
      "requestedWorkTasks": [
        {
          "assigneeSlackUserIds": ["U_MIKA"],
          "channelId": "C_OPS",
          "completedAt": null,
          "createdAt": "2026-06-29T04:00:00Z",
          "dueAt": "2026-07-02T09:00:00Z",
          "id": "T_SUMMARY",
          "kind": "work",
          "messageTs": null,
          "requesterSlackUserIds": ["U_SANA"],
          "status": "active",
          "title": "Send the call summary to the channel",
          "updatedAt": "2026-06-30T06:00:00Z",
          "workspaceId": "W_DEV"
        }
      ],
      "followUpTasks": [
        {
          "assigneeSlackUserIds": ["U_SANA"],
          "completedAt": null,
          "createdAt": "2026-06-30T03:00:00Z",
          "followUpAnswer": null,
          "followUpQuestion": "push-to-talk 方針の決定後に、期限と説明文を再確認する。",
          "channelId": "C_DEV",
          "id": "F_NEXT",
          "kind": "follow_up",
          "messageTs": null,
          "requesterSlackUserIds": ["U_KEN"],
          "sourceTaskId": "T_FOCUS",
          "status": "active",
          "title": "次回の確認",
          "updatedAt": "2026-06-30T03:00:00Z",
          "workspaceId": "W_DEV"
        }
      ],
      "assignedChannels": [
        {
          "assigneeSlackUserIds": ["U_SANA"],
          "channelId": "C_DEV",
          "createdAt": "2026-06-01T00:00:00Z",
          "createdBySlackUserId": "U_SANA",
          "latestInfo": "通話体験の改善を進行中。push-to-talk と会議ノートの見え方を確認する。",
          "latestInfoUpdatedAt": "2026-06-30T08:00:00Z",
          "name": "dev-exe",
          "status": "active",
          "updatedAt": "2026-06-30T08:00:00Z",
          "watcherSlackUserIds": ["U_KEN"],
          "workspaceId": "W_DEV"
        }
      ],
      "watchedChannels": [
        {
          "assigneeSlackUserIds": [],
          "channelId": "C_OPS",
          "createdAt": "2026-06-01T00:00:00Z",
          "createdBySlackUserId": "U_KEN",
          "latestInfo": "運用レビューの手順を確認中。",
          "latestInfoUpdatedAt": "2026-06-30T07:00:00Z",
          "name": "ops-review",
          "status": "active",
          "updatedAt": "2026-06-30T07:00:00Z",
          "watcherSlackUserIds": ["U_SANA"],
          "workspaceId": "W_DEV"
        }
      ],
      "channelBlocks": [
        {
          "channelId": "C_DEV",
          "createdAt": "2026-06-29T08:00:00Z",
          "createdBySlackUserId": "U_KEN",
          "description": "通話中のノイズ対策と push-to-talk の切替を先に決める必要がある。",
          "id": "B_NOISE",
          "resolvedAt": null,
          "status": "active",
          "title": "通話中のノイズ対策",
          "updatedAt": "2026-06-30T08:00:00Z",
          "workspaceId": "W_DEV"
        },
        {
          "channelId": "C_OPS",
          "createdAt": "2026-06-29T09:00:00Z",
          "createdBySlackUserId": "U_MIKA",
          "description": "レビュー依頼のテンプレートを誰が更新するか未定。",
          "id": "B_TEMPLATE",
          "resolvedAt": null,
          "status": "active",
          "title": "依頼テンプレートの担当未定",
          "updatedAt": "2026-06-30T07:00:00Z",
          "workspaceId": "W_DEV"
        }
      ],
      "channels": [
        {
          "assigneeSlackUserIds": ["U_SANA"],
          "channelId": "C_DEV",
          "createdAt": "2026-06-01T00:00:00Z",
          "createdBySlackUserId": "U_SANA",
          "latestInfo": "通話体験の改善を進行中。push-to-talk と会議ノートの見え方を確認する。",
          "latestInfoUpdatedAt": "2026-06-30T08:00:00Z",
          "name": "dev-exe",
          "status": "active",
          "updatedAt": "2026-06-30T08:00:00Z",
          "watcherSlackUserIds": ["U_KEN"],
          "workspaceId": "W_DEV"
        },
        {
          "assigneeSlackUserIds": [],
          "channelId": "C_OPS",
          "createdAt": "2026-06-01T00:00:00Z",
          "createdBySlackUserId": "U_KEN",
          "latestInfo": "運用レビューの手順を確認中。",
          "latestInfoUpdatedAt": "2026-06-30T07:00:00Z",
          "name": "ops-review",
          "status": "active",
          "updatedAt": "2026-06-30T07:00:00Z",
          "watcherSlackUserIds": ["U_SANA"],
          "workspaceId": "W_DEV"
        }
      ]
    }
    """
}
#endif
