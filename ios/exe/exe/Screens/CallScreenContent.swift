import ExeDomain
import ExeLiveKit
import ExeUI
import SwiftUI

extension CallScreen {
    var activeContent: some View {
        huddleContent(showsJoinAction: false)
    }

    var connectingContent: some View {
        huddleContent(showsJoinAction: false)
    }

    var loadingContent: some View {
        huddleContent(showsJoinAction: false)
    }

    var lobbyContent: some View {
        huddleContent(showsJoinAction: true)
    }

    var huddleContent: some View {
        huddleContent(showsJoinAction: phase == .lobby)
    }

    private func huddleContent(showsJoinAction: Bool) -> some View {
        ZStack(alignment: .bottom) {
            HuddleBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                huddleHeader
                    .padding(.horizontal, 18)
                    .padding(.top, 10)

                Spacer(minLength: 18)

                participantStage()
                    .padding(.horizontal, 22)

                Spacer(minLength: 18)

                if showsJoinAction {
                    joinCallButton
                        .padding(.horizontal, 22)
                        .padding(.bottom, 14)
                }

                huddleControls
                    .padding(.horizontal, 22)
                    .padding(.bottom, isMeetingDocumentOpen ? 14 : 24)
            }

            meetingDocumentOverlay
        }
        .animation(.snappy(duration: 0.22), value: isMeetingDocumentOpen)
    }

    private var huddleHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            huddleMenu

            Spacer(minLength: 0)

            Button(role: .destructive) {
                endCall()
            } label: {
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
            .accessibilityLabel("End call")
        }
    }

    private var meetingDocumentModalBottomPadding: CGFloat {
        88
    }

    private func meetingDocumentModalTopPadding(in proxy: GeometryProxy) -> CGFloat {
        max(proxy.safeAreaInsets.top + 8, 56)
    }

    @ViewBuilder
    private var meetingDocumentOverlay: some View {
        if isMeetingDocumentPresented {
            GeometryReader { proxy in
                MeetingDocumentPanel(
                    agenda: liveKitManager.agenda,
                    gbrainLookups: liveKitManager.gbrainLookups,
                    members: members,
                    proposedChannelBlockDrafts: liveKitManager.proposedChannelBlockDrafts,
                    proposedChannelReviewDrafts: liveKitManager.proposedChannelReviewDrafts,
                    proposedDrafts: liveKitManager.proposedDrafts,
                    proposedLatestInfoDrafts: liveKitManager.proposedLatestInfoDrafts,
                    proposedPatches: liveKitManager.proposedPatches,
                    proposedWorkTaskDrafts: liveKitManager.proposedWorkTaskDrafts,
                    taskTitle: taskTitle(for:),
                    channelLabel: channelLabel(for:),
                    memberLabel: memberLabel(for:),
                    taskStatusLabel: { taskStatusLabel($0) }
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
        .accessibilityLabel("Call settings")
    }

    private func participantStage() -> some View {
        HuddleParticipantRowLayout {
            HuddleParticipantTile(
                isActive: true,
                isMuted: liveKitManager.isMuted,
                isSpeaking: isUserSpeaking,
                label: "You",
                member: selfMember,
                style: .person
            )

            HuddleParticipantTile(
                isActive: liveKitManager.isAgentConnected,
                isMuted: false,
                isSpeaking: liveKitManager.isAgentSpeaking,
                label: liveKitManager.isAgentConnected ? "exe" : String(localized: "Waiting for exe"),
                member: nil,
                showsActivity: !liveKitManager.isAgentConnected,
                style: .appIcon
            )
        }
        .frame(maxWidth: .infinity)
    }

    private var isUserSpeaking: Bool {
        if isPushToTalkEnabled {
            return isPushToTalkButtonActive
        }

        return !liveKitManager.isMuted && liveKitManager.isUserSpeaking
    }

    private var joinCallButton: some View {
        Button {
            Swift.Task { await connect() }
        } label: {
            Label("Join call", systemImage: "phone.fill")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(ExeColors.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var selfMember: SlackWorkspaceMember? {
        guard let slackUserId = liveKitManager.agenda?.slackUserId else { return nil }
        return members.first { $0.slackId == slackUserId }
    }
}
