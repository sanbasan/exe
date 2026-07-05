import Foundation

#if DEBUG
enum MeetingDocumentPanelPreviewFixtureJSONPart2 {
    static let part2 = """
          {
            "activeBlocks": [],
            "assignedWorkTasks": [
              {
                "assigneeSlackUserIds": ["U_SELF"],
                "channelId": "C_OPS",
                "completedAt": null,
                "createdAt": "2026-06-27T01:00:00.000Z",
                "dueAt": "2026-07-03T04:00:00.000Z",
                "id": "T_OPS",
                "kind": "work",
                "messageTs": null,
                "requesterSlackUserIds": ["U_MIKA"],
                "status": "active",
                "title": "運用レビューの担当を整理",
                "updatedAt": "2026-06-30T03:00:00.000Z",
                "workspaceId": "W_PREVIEW"
              }
            ],
            "channel": {
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
            },
            "completedWorkTasksSinceLastCheck": [],
            "otherActiveWorkTasks": [],
            "reviewState": {
              "channelId": "C_OPS",
              "createdAt": "2026-06-20T00:00:00.000Z",
              "id": "RS_OPS",
              "lastCheckedAt": "2026-06-29T09:00:00.000Z",
              "lastSelfReport": null,
              "nextCheckAt": null,
              "nextCheckReason": null,
              "slackUserId": "U_SELF",
              "statusText": null,
              "statusUpdatedAt": null,
              "updatedAt": "2026-06-29T09:00:00.000Z",
              "workspaceId": "W_PREVIEW"
            }
          }
        ],
        "followUpTasks": [],
        "language": "ja",
        "now": "2026-06-30T10:24:29.903Z",
        "purpose": "scheduled_review",
        "slackUserId": "U_SELF",
        "timezone": "Asia/Tokyo",
        "workTasks": []
      },
      "drafts": [
        {
          "assigneeSlackUserIds": ["U_KEN"],
          "channelId": "C_DEV",
          "followUpQuestion": "push-to-talk を標準にするか、ミュート切替のままにするか確認してください。",
          "requesterSlackUserIds": ["U_SELF"],
          "sourceTaskId": "T_PUSH",
          "title": "入力方法の方針確認"
        },
        {
          "assigneeSlackUserIds": null,
          "channelId": null,
          "followUpQuestion": "次回の全体レビューで扱うチャンネルを確定してください。",
          "requesterSlackUserIds": ["U_SELF"],
          "sourceTaskId": null,
          "title": "次回レビュー対象の確認"
        }
      ],
      "members": [
        {
          "id": "U_SELF",
          "name": "sana",
          "profile": {
            "display_name": "Sana",
            "real_name": "Sana"
          },
          "real_name": "Sana"
        },
        {
          "id": "U_KEN",
          "name": "ken",
          "profile": {
            "display_name": "Ken",
            "real_name": "Ken"
          },
          "real_name": "Ken"
        },
        {
          "id": "U_MIKA",
          "name": "mika",
          "profile": {
            "display_name": "Mika",
            "real_name": "Mika"
          },
          "real_name": "Mika"
        }
      ],
      "patches": [
        {
          "after": {
            "dueAt": "2026-07-01T10:24:29.903Z",
            "kind": "work"
          },
          "before": {
            "assigneeSlackUserIds": ["U_SELF"],
            "channelId": "C_DEV",
            "dueAt": "2026-06-30T11:00:00.000Z",
            "kind": "work",
            "requesterSlackUserIds": ["U_KEN"],
            "status": "active",
            "title": "Improve focus by using push-to-talk"
          },
          "taskId": "T_PUSH"
        },
        {
          "after": {
            "kind": "work",
            "status": "completed"
          },
          "before": {
            "assigneeSlackUserIds": ["U_SELF"],
            "channelId": "C_DEV",
            "dueAt": "2026-06-30T08:00:00.000Z",
            "kind": "work",
            "requesterSlackUserIds": ["U_MIKA"],
            "status": "active",
            "title": "Send the call summary to the channel"
          },
          "taskId": "T_SUMMARY"
        },
        {
          "after": {
            "channelId": "C_UNKNOWN",
            "kind": "work",
            "title": "Confirm rollout owner before the next review"
          },
          "before": null,
          "taskId": "T_OTHER"
        }
      ],
      "workDrafts": [
        {
          "assigneeSlackUserIds": ["U_SELF"],
          "channelId": "C_DEV",
          "dueAt": "2026-07-01T09:00:00.000Z",
          "requesterSlackUserIds": ["U_KEN"],
          "title": "Check tool progress speech in production"
        }
      ]
    }
    """
}
#endif
