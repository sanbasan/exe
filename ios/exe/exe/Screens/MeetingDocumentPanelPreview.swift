import ExeDomain
import ExeUI
import SwiftUI

#if DEBUG
private struct MeetingDocumentPanelPreviewSurface: View {
    private let fixture = MeetingDocumentPanelPreviewData.fixture
    var showsCallChrome = false

    var body: some View {
        ZStack(alignment: .bottom) {
            if showsCallChrome {
                HuddleBackground()
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    previewHeader
                        .padding(.horizontal, 18)
                        .padding(.top, 10)
                    Spacer()
                    previewControls
                        .padding(.bottom, 24)
                }
            } else {
                ExeColors.background
                    .ignoresSafeArea()
            }

            panel
                .padding(.horizontal, showsCallChrome ? 12 : 18)
                .padding(.bottom, showsCallChrome ? 98 : 18)
        }
    }

    private var panel: some View {
        MeetingDocumentPanel(
            agenda: fixture.agenda,
            members: fixture.members,
            proposedDrafts: fixture.drafts,
            proposedPatches: fixture.patches,
            proposedWorkTaskDrafts: fixture.workDrafts,
            taskTitle: taskTitle,
            channelLabel: channelLabel,
            memberLabel: memberLabel,
            taskStatusLabel: taskStatusLabel
        )
    }

    private var previewHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("#dev-exe")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                Text("AI と通話中")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.82))
            }

            Spacer()

            Text("Leave")
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 52)
                .background(
                    LinearGradient(
                        colors: [
                            Color(red: 0.93, green: 0.18, blue: 0.45),
                            Color(red: 0.78, green: 0.12, blue: 0.38)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: Capsule()
                )
        }
    }

    private var previewControls: some View {
        HStack(spacing: 20) {
            HuddleControlIcon(systemName: "mic.fill")
            HuddleControlIcon(systemName: "doc.text.fill")
        }
    }

    private func taskTitle(_ taskId: String) -> String? {
        fixture.taskTitles[taskId]
    }

    private func channelLabel(_ channelId: SlackChannelID) -> String {
        fixture.channelNames[channelId].map { "#\($0)" } ?? "#\(channelId)"
    }

    private func memberLabel(_ slackUserId: SlackUserID) -> String {
        fixture.memberNames[slackUserId] ?? slackUserId
    }

    private func taskStatusLabel(_ status: TaskStatus) -> String {
        switch status {
            case .active:
                "対応中"
            case .blocked:
                "ブロック"
            case .cancelled:
                "キャンセル"
            case .completed:
                "完了"
        }
    }
}

struct MeetingDocumentPanelFixture {
    let agenda: CallAgenda
    let channelNames: [SlackChannelID: String]
    let drafts: [FollowUpTaskDraft]
    let members: [SlackWorkspaceMember]
    let memberNames: [SlackUserID: String]
    let patches: [TaskPatch]
    let taskTitles: [String: String]
    let workDrafts: [WorkTaskDraft]
}

private struct MeetingDocumentPanelPayload: Decodable {
    let agenda: CallAgenda
    let drafts: [FollowUpTaskDraft]
    let members: [SlackWorkspaceMember]
    let patches: [TaskPatch]
    let workDrafts: [WorkTaskDraft]
}

enum MeetingDocumentPanelPreviewData {
    static let fixture: MeetingDocumentPanelFixture = {
        let payload = decode(MeetingDocumentPanelPayload.self, from: MeetingDocumentPanelPreviewFixtureJSON.json)
        let channelNames = Dictionary(uniqueKeysWithValues: payload.agenda.channels.map { ($0.channelId, $0.name) })
        let memberNames = Dictionary(uniqueKeysWithValues: payload.members.compactMap { member in
            member.slackId.map { ($0, member.displayName) }
        })
        let reviewTasks = payload.agenda.channelReviews.flatMap { item in
            item.assignedWorkTasks + item.completedWorkTasksSinceLastCheck + item.otherActiveWorkTasks
        }
        let taskTitles = Dictionary(
            uniqueKeysWithValues: (payload.agenda.workTasks + reviewTasks).map { ($0.id, $0.title) }
        )

        return MeetingDocumentPanelFixture(
            agenda: payload.agenda,
            channelNames: channelNames,
            drafts: payload.drafts,
            members: payload.members,
            memberNames: memberNames,
            patches: payload.patches,
            taskTitles: taskTitles,
            workDrafts: payload.workDrafts
        )
    }()

    private static func decode<Value: Decodable>(_ type: Value.Type, from json: String) -> Value {
        guard let data = json.data(using: .utf8) else {
            fatalError("Preview JSON is not UTF-8.")
        }

        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            fatalError("Preview JSON failed to decode: \(error)")
        }
    }
}

#Preview("Meeting Document Modal") {
    MeetingDocumentPanelPreviewSurface()
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Meeting Document On Call") {
    MeetingDocumentPanelPreviewSurface(showsCallChrome: true)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Meeting Document Narrow") {
    MeetingDocumentPanelPreviewSurface()
        .frame(width: 390, height: 760)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
