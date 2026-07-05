import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

extension ChannelsScreen {
    @ViewBuilder
    var content: some View {
        if let channels {
            if channels.isEmpty {
                ContentUnavailableView(
                    "No channels",
                    systemImage: "number",
                    description: Text("Channels appear here after @exe is mentioned in Slack.")
                )
            } else if filteredVisibleChannels.isEmpty {
                ContentUnavailableView(
                    "No matching channels",
                    systemImage: "magnifyingglass"
                )
            } else {
                reviewTargetSection
                assignedSection
                archivedSection
            }
        } else {
            ExeLoadingView(message: "Loading channels")
                .frame(maxWidth: .infinity)
                .frame(minHeight: 220)
        }
    }

    @ViewBuilder
    var reviewTargetSection: some View {
        if !reviewTargetChannels.isEmpty {
            channelSection("Not assigned") {
                SettingsDividedRows(reviewTargetChannels) { watchRow($0) }
            }
        }
    }

    @ViewBuilder
    var assignedSection: some View {
        if !assignedChannels.isEmpty {
            channelSection("Assigned channels") {
                SettingsDividedRows(assignedChannels) { channelRow($0) }
            }
        }
    }

    @ViewBuilder
    var archivedSection: some View {
        if canEditChannelMetadata, !archivedChannels.isEmpty {
            channelSection("Archived") {
                SettingsDividedRows(archivedChannels) { channelRow($0) }
            }
        }
    }

    @ViewBuilder
    var statusSection: some View {
        if let saveMessage {
            SettingsInlineMessage(saveMessage, style: .success)
        }

        if let errorMessage {
            InlineErrorView(errorMessage)
        }
    }

    var activeChannels: [Channel] {
        (channels ?? [])
            .filter { $0.status == .active }
            .sorted { $0.createdAt < $1.createdAt }
    }

    var archivedChannels: [Channel] {
        filterChannels((channels ?? []).filter { $0.status == .archived })
    }

    var assignedChannels: [Channel] {
        guard let currentUserSlackId else { return [] }
        return filterChannels(
            activeChannels.filter { $0.assigneeSlackUserIds.contains(currentUserSlackId) }
        )
    }

    var canEditChannelMetadata: Bool {
        guard
            let workspace,
            let currentUserSlackId
        else {
            return false
        }

        return workspace.canManageWorkspaceSettings ||
            workspace.channelOwnerEditors.slackUserIds.contains(currentUserSlackId)
    }

    var currentUserSlackId: SlackUserID? {
        userProfile?.slackUsers.first { $0.workspaceId == workspaceId }?.slackUserId
    }

    var filteredVisibleChannels: [Channel] {
        reviewTargetChannels + assignedChannels + archivedChannels
    }

    var hasWatchChanges: Bool {
        selectedWatchedChannelIds != originalWatchedChannelIds
    }

    var reviewTargetChannels: [Channel] {
        guard let currentUserSlackId else {
            return filterChannels(activeChannels)
        }

        return filterChannels(
            activeChannels.filter { !$0.assigneeSlackUserIds.contains(currentUserSlackId) }
        )
    }

    func channelRow(_ channel: Channel) -> some View {
        ChannelManagementRow(
            ChannelManagementRowState(
                channel: channel,
                isSaving: isSavingChannelId == channel.id
            )
        ) {
            channelMenu(channel)
        }
    }

    func watchBinding(for channel: Channel) -> Binding<Bool> {
        Binding(
            get: { selectedWatchedChannelIds.contains(channel.channelId) },
            set: { isSelected in
                if isSelected {
                    selectedWatchedChannelIds.insert(channel.channelId)
                } else {
                    selectedWatchedChannelIds.remove(channel.channelId)
                }
            }
        )
    }

    func watchRow(_ channel: Channel) -> some View {
        ChannelManagementRow(
            ChannelManagementRowState(
                channel: channel,
                isSaving: isSavingChannelId == channel.id || isSavingWatchSettings,
                watchBinding: watchBinding(for: channel)
            )
        )
    }

    @ViewBuilder
    func channelMenu(_ channel: Channel) -> some View {
        Button {
            channelLatestInfoToEdit = channel
        } label: {
            Label("Edit latest info", systemImage: "square.and.pencil")
        }

        if canEditChannelMetadata {
            Button {
                channelToEdit = channel
            } label: {
                Label("Edit assignees", systemImage: "person.2.badge.gearshape")
            }

            if channel.status == .archived {
                Button {
                    updateChannel(
                        channel,
                        input: PatchChannelInput(status: .active)
                    )
                } label: {
                    Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                }
            } else {
                Button(role: .destructive) {
                    channelToArchive = ChannelActionTarget(channel: channel)
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
            }
        }
    }

    func filterChannels(_ channels: [Channel]) -> [Channel] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return channels }

        return channels.filter { channel in
            [
                channel.name,
                channel.latestInfo ?? ""
            ]
            .joined(separator: " ")
            .lowercased()
            .contains(term)
        }
    }

    private func channelSection(
        _ title: LocalizedStringKey,
        @ViewBuilder content: () -> some View
    ) -> some View {
        SettingsPlainSection(title) {
            VStack(spacing: 0) {
                content()
            }
        }
    }
}
