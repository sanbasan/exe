import ExeDomain
import ExeUI
import SwiftUI

#if DEBUG
extension CallScreenHuddlePreviewSurface {
    @ViewBuilder
    var meetingDocumentOverlay: some View {
        if isMeetingDocumentPresented {
            GeometryReader { proxy in
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
                .padding(.horizontal, 12)
                .padding(.top, meetingDocumentModalTopPadding(in: proxy))
                .padding(.bottom, meetingDocumentModalBottomPadding)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .offset(y: isMeetingDocumentOpen ? 0 : proxy.size.height)
                .opacity(isMeetingDocumentOpen ? 1 : 0)
            }
            .allowsHitTesting(isMeetingDocumentOpen)
        }
    }

    var huddleHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            huddleMenu

            Spacer(minLength: 0)

            Button(role: .destructive) {} label: {
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
            .buttonStyle(.plain)
        }
    }

    var participantStage: some View {
        HuddleParticipantRowLayout {
            HuddleParticipantTile(
                isActive: true,
                isMuted: previewIsMuted,
                isSpeaking: previewIsUserSpeaking,
                label: "You",
                member: selfMember,
                style: .person
            )

            HuddleParticipantTile(
                isActive: variant.isAgentConnected,
                isMuted: false,
                isSpeaking: variant.isAgentConnected && !previewIsUserSpeaking,
                label: variant.isAgentConnected ? "exe" : "exe を待機中",
                member: nil,
                showsActivity: !variant.isAgentConnected,
                style: .appIcon
            )
        }
        .frame(maxWidth: .infinity)
    }

    var joinCallButton: some View {
        Button {} label: {
            Label("通話に参加", systemImage: "phone.fill")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(ExeColors.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    var previewIsMuted: Bool {
        isPushToTalkEnabled ? !isPushToTalkActive : isMuted
    }

    var previewIsUserSpeaking: Bool {
        isPushToTalkEnabled ? isPushToTalkActive : !isMuted
    }

    private var huddleMenu: some View {
        Menu {
            Toggle("Push to Talk", isOn: pushToTalkModeBinding)
        } label: {
            Image(systemName: "ellipsis")
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("通話設定")
    }

    private var meetingDocumentModalBottomPadding: CGFloat {
        88
    }

    private func meetingDocumentModalTopPadding(in proxy: GeometryProxy) -> CGFloat {
        max(proxy.safeAreaInsets.top + 8, 56)
    }

    private var selfMember: SlackWorkspaceMember? {
        fixture.members.first { $0.slackId == fixture.agenda.slackUserId }
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
#endif
