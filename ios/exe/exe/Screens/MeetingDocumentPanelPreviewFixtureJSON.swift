import Foundation

#if DEBUG
enum MeetingDocumentPanelPreviewFixtureJSON {
    static let json = part1 + MeetingDocumentPanelPreviewFixtureJSONPart2.part2

    private static let part1 = """
    {
      "agenda": {
        "channelOpenWorkTasks": [],
        "channels": [
          {
            "assigneeSlackUserIds": ["U_SELF"],
            "channelId": "C_DEV",
            "createdAt": "2026-06-01T00:00:00.000Z",
            "createdBySlackUserId": "U_SELF",
            "latestInfo": "通話体験の改善を進行中。push-to-talk の方針と、会議ノートの見え方をこの確認で詰める。",
            "latestInfoUpdatedAt": "2026-06-30T09:40:00.000Z",
            "name": "dev-exe",
            "status": "active",
            "updatedAt": "2026-06-30T09:40:00.000Z",
            "watcherSlackUserIds": ["U_KEN"],
            "workspaceId": "W_PREVIEW"
          },
          {
            "assigneeSlackUserIds": ["U_SELF"],
            "channelId": "C_OPS",
            "createdAt": "2026-06-01T00:00:00.000Z",
            "createdBySlackUserId": "U_SELF",
            "latestInfo": "運用手順は安定しているが、レビュー依頼の導線に少し詰まりがある。",
            "latestInfoUpdatedAt": "2026-06-29T10:00:00.000Z",
            "name": "ops-review",
            "status": "active",
            "updatedAt": "2026-06-29T10:00:00.000Z",
            "watcherSlackUserIds": [],
            "workspaceId": "W_PREVIEW"
          }
        ],
        "channelReviews": [
          {
            "activeBlocks": [
              {
                "channelId": "C_DEV",
                "createdAt": "2026-06-28T08:00:00.000Z",
                "createdBySlackUserId": "U_SELF",
                "description": "ノイズが入る環境で常時マイクを開くと会話が散るため、録音操作の設計確認が必要。",
                "id": "B_AUDIO",
                "resolvedAt": null,
                "status": "active",
                "title": "通話中の入力方法が未確定",
                "updatedAt": "2026-06-30T09:00:00.000Z",
                "workspaceId": "W_PREVIEW"
              }
            ],
            "assignedWorkTasks": [
              {
                "assigneeSlackUserIds": ["U_SELF"],
                "channelId": "C_DEV",
                "completedAt": null,
                "createdAt": "2026-06-29T02:00:00.000Z",
                "dueAt": "2026-06-30T11:00:00.000Z",
                "id": "T_PUSH",
                "kind": "work",
                "messageTs": null,
                "requesterSlackUserIds": ["U_KEN"],
                "status": "active",
                "title": "Improve focus by using push-to-talk",
                "updatedAt": "2026-06-30T09:10:00.000Z",
                "workspaceId": "W_PREVIEW"
              },
              {
                "assigneeSlackUserIds": ["U_SELF"],
                "channelId": "C_DEV",
                "completedAt": null,
                "createdAt": "2026-06-29T06:00:00.000Z",
                "dueAt": "2026-06-30T08:00:00.000Z",
                "id": "T_SUMMARY",
                "kind": "work",
                "messageTs": null,
                "requesterSlackUserIds": ["U_MIKA"],
                "status": "active",
                "title": "Send the call summary to the channel",
                "updatedAt": "2026-06-30T08:15:00.000Z",
                "workspaceId": "W_PREVIEW"
              }
            ],
            "channel": {
              "assigneeSlackUserIds": ["U_SELF"],
              "channelId": "C_DEV",
              "createdAt": "2026-06-01T00:00:00.000Z",
              "createdBySlackUserId": "U_SELF",
              "latestInfo": "通話体験の改善を進行中。push-to-talk の方針と、会議ノートの見え方をこの確認で詰める。",
              "latestInfoUpdatedAt": "2026-06-30T09:40:00.000Z",
              "name": "dev-exe",
              "status": "active",
              "updatedAt": "2026-06-30T09:40:00.000Z",
              "watcherSlackUserIds": ["U_KEN"],
              "workspaceId": "W_PREVIEW"
            },
            "completedWorkTasksSinceLastCheck": [
              {
                "assigneeSlackUserIds": ["U_SELF"],
                "channelId": "C_DEV",
                "completedAt": "2026-06-30T06:30:00.000Z",
                "createdAt": "2026-06-28T02:00:00.000Z",
                "dueAt": "2026-06-30T07:00:00.000Z",
                "id": "T_CARD_PREVIEW",
                "kind": "work",
                "messageTs": null,
                "requesterSlackUserIds": ["U_SELF"],
                "status": "completed",
                "title": "カード単体の Preview を追加",
                "updatedAt": "2026-06-30T06:30:00.000Z",
                "workspaceId": "W_PREVIEW"
              }
            ],
            "otherActiveWorkTasks": [
              {
                "assigneeSlackUserIds": ["U_KEN"],
                "channelId": "C_DEV",
                "completedAt": null,
                "createdAt": "2026-06-29T04:00:00.000Z",
                "dueAt": "2026-07-02T02:00:00.000Z",
                "id": "T_KEN",
                "kind": "work",
                "messageTs": null,
                "requesterSlackUserIds": ["U_SELF"],
                "status": "active",
                "title": "push-to-talk の操作案をレビュー",
                "updatedAt": "2026-06-30T09:30:00.000Z",
                "workspaceId": "W_PREVIEW"
              }
            ],
            "reviewState": {
              "channelId": "C_DEV",
              "createdAt": "2026-06-20T00:00:00.000Z",
              "id": "RS_DEV",
              "lastCheckedAt": "2026-06-29T09:00:00.000Z",
              "lastSelfReport": "カードの表示確認を進める。",
              "nextCheckAt": "2026-07-01T10:24:29.903Z",
              "nextCheckReason": "push-to-talk 方針の決定後に、期限と説明を再確認する。",
              "slackUserId": "U_SELF",
              "statusText": "通話中のノイズ対策を優先。カード表示は Preview で素早く確認しながら詰める。",
              "statusUpdatedAt": "2026-06-30T09:30:00.000Z",
              "updatedAt": "2026-06-30T09:30:00.000Z",
              "workspaceId": "W_PREVIEW"
            }
          },
    """
}
#endif
