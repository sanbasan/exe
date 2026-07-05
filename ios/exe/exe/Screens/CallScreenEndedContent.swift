import ExeDomain
import ExeLiveKit
import ExeUI
import SwiftUI

extension CallScreen {
    var endedContent: some View {
        ZStack(alignment: .bottom) {
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()

            MeetingDocumentPanel(
                agenda: liveKitManager.agenda,
                gbrainLookups: liveKitManager.gbrainLookups,
                members: members,
                proposedDrafts: liveKitManager.proposedDrafts,
                proposedLatestInfoDrafts: liveKitManager.proposedLatestInfoDrafts,
                proposedPatches: liveKitManager.proposedPatches,
                proposedWorkTaskDrafts: liveKitManager.proposedWorkTaskDrafts,
                taskTitle: taskTitle(for:),
                channelLabel: channelLabel(for:),
                memberLabel: memberLabel(for:),
                taskStatusLabel: { taskStatusLabel($0) },
                presentation: .fullScreen
            )
            .safeAreaPadding(.bottom, 92)

            Button {
                router.popToRoot()
            } label: {
                CallEndedHomeButtonLabel()
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
        }
    }
}

private struct CallEndedHomeButtonLabel: View {
    var body: some View {
        Label("Back to home", systemImage: "house.fill")
            .font(.headline.weight(.semibold))
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity)
            .frame(height: 58)
            .contentShape(Capsule())
            .exeGlassBackground(shape: .capsule, isInteractive: true)
            .overlay {
                Capsule()
                    .stroke(.white.opacity(0.22), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.14), radius: 18, y: 8)
    }
}

#if DEBUG
private struct CallScreenEndedPreviewSurface: View {
    private let fixture = MeetingDocumentPanelPreviewData.fixture

    var body: some View {
        ZStack(alignment: .bottom) {
            Color(uiColor: .systemGroupedBackground)
                .ignoresSafeArea()

            MeetingDocumentPanel(
                agenda: fixture.agenda,
                gbrainLookups: GBrainCallTabPreviewData.samples,
                members: fixture.members,
                proposedDrafts: fixture.drafts,
                proposedPatches: fixture.patches,
                proposedWorkTaskDrafts: fixture.workDrafts,
                taskTitle: taskTitle,
                channelLabel: channelLabel,
                memberLabel: memberLabel,
                taskStatusLabel: taskStatusLabel,
                presentation: .fullScreen
            )
            .safeAreaPadding(.bottom, 92)

            Button {} label: {
                CallEndedHomeButtonLabel()
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
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

#Preview("Call Ended") {
    CallScreenEndedPreviewSurface()
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Call Ended Narrow") {
    CallScreenEndedPreviewSurface()
        .frame(width: 390, height: 844)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
