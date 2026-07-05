import ExeDomain
import ExeUI
import SwiftUI

/// The in-call meeting note is organized BY CHANNEL. A tab bar lets the user
/// jump between the channels they own; each tab shows that channel's current
/// state, the user's own tasks, other people's active tasks, blocks, the
/// composed status, and the next-check plan. Items not tied to a channel land in
/// a trailing "その他" tab.
struct MeetingDocumentPanel: View {
    let agenda: CallAgenda?
    var gbrainLookups: [GBrainCallLookupActivity] = []
    let members: [SlackWorkspaceMember]
    var proposedChannelBlockDrafts: [ChannelBlockDraft] = []
    var proposedChannelReviewDrafts: [ChannelReviewDraft] = []
    let proposedDrafts: [FollowUpTaskDraft]
    var proposedLatestInfoDrafts: [LatestInfoDraft] = []
    let proposedPatches: [TaskPatch]
    let proposedWorkTaskDrafts: [WorkTaskDraft]
    let taskTitle: (String) -> String?
    let channelLabel: (SlackChannelID) -> String
    let memberLabel: (SlackUserID) -> String
    let taskStatusLabel: (TaskStatus) -> String
    var presentation: MeetingDocumentPanelPresentation = .modal

    @State
    private var selectedTab: MeetingDocumentTab = .channel("")

    var body: some View {
        VStack(spacing: 0) {
            tabBar
                .padding(.top, 18)
                .padding(.bottom, 6)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    tabContent
                }
                .padding(18)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity, alignment: .top)
        .background {
            if presentation == .modal {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(Color(uiColor: .systemGroupedBackground))
            } else {
                Color(uiColor: .systemGroupedBackground)
            }
        }
        .mask {
            if presentation == .modal {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
            } else {
                Rectangle()
            }
        }
        .overlay {
            if presentation == .modal {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(ExeColors.border, lineWidth: 1)
            }
        }
        .onAppear { ensureSelection() }
        .onChange(of: tabs.map(\.id)) { _, _ in ensureSelection() }
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs) { tab in
                    let isSelected = tab.id == selectedTab.id
                    Button {
                        selectedTab = tab.tab
                    } label: {
                        tabLabel(for: tab, isSelected: isSelected)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
        }
    }

    @ViewBuilder
    private func tabLabel(for tab: MeetingDocumentTabEntry, isSelected: Bool) -> some View {
        if tab.tab == .gbrain {
            HStack(spacing: 6) {
                Image(systemName: "brain.head.profile")
                Text("GBrain")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isSelected ? Color.white : GBrainCallVisual.purple)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background {
                if isSelected {
                    Capsule().fill(GBrainCallVisual.gradient)
                } else {
                    Capsule().fill(Color(uiColor: .secondarySystemGroupedBackground))
                }
            }
            .overlay {
                if !isSelected {
                    Capsule().stroke(GBrainCallVisual.borderGradient, lineWidth: 1.5)
                }
            }
        } else {
            Text(tab.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isSelected ? Color.white : .primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    isSelected ? ExeColors.accent : Color(uiColor: .secondarySystemGroupedBackground),
                    in: Capsule()
                )
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
            case .gbrain:
                GBrainCallTab(lookups: gbrainLookups, channelName: channelDisplayName(for:))
            case let .channel(channelId):
                if let item = channelItems.first(where: { $0.channel.channelId == channelId }) {
                    ChannelReviewTab(
                        item: item,
                        diffBuilder: diffBuilder,
                        drafts: drafts(forChannel: channelId),
                        latestPatches: latestPatchByTaskId(),
                        memberLabel: memberLabel,
                        proposedBlockDrafts: blockDrafts(forChannel: channelId),
                        proposedLatestInfoDraft: latestInfoDraft(forChannel: channelId),
                        proposedReviewDraft: reviewDraft(forChannel: channelId),
                        workDrafts: workDrafts(forChannel: channelId)
                    )
                } else {
                    DocumentEmptyLine(String(localized: "No channels assigned yet."))
                }
            case .other:
                OtherItemsTab(
                    diffBuilder: diffBuilder,
                    drafts: unassignedDrafts,
                    memberLabel: memberLabel,
                    patches: unassignedPatches,
                    title: taskTitle,
                    workDrafts: unassignedWorkDrafts
                )
        }
    }
}

enum MeetingDocumentPanelPresentation {
    case modal
    case fullScreen
}

enum MeetingDocumentTab: Hashable {
    case channel(SlackChannelID)
    case gbrain
    case other

    var id: String {
        switch self {
            case let .channel(channelId):
                "channel:\(channelId)"
            case .gbrain:
                "gbrain"
            case .other:
                "other"
        }
    }
}

struct MeetingDocumentTabEntry: Identifiable {
    let tab: MeetingDocumentTab
    let title: String

    var id: String {
        tab.id
    }
}

extension MeetingDocumentPanel {
    func ensureSelection() {
        if !tabs.contains(where: { $0.id == selectedTab.id }), let first = tabs.first {
            selectedTab = first.tab
        }
    }
}
