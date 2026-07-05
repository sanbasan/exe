import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

extension WorkspaceHomeScreen {
    @ViewBuilder
    func homeContent(_ snapshot: HomeSnapshot) -> some View {
        WorkspaceHomeScheduleRow(snapshot: snapshot) {
            router.navigate(to: .callScheduleSettings(workspaceId: workspaceId))
        }

        let channels = snapshot.visibleHomeChannels
        if channels.isEmpty {
            WorkspaceHomeEmptyChannelsNotice()
        } else {
            WorkspaceHomeChannelList(
                channels: channels,
                isSavingBlockId: isSavingBlockId,
                isSavingChannelId: isSavingChannelId,
                isSavingTaskId: isSavingTaskId,
                members: members,
                snapshot: snapshot,
                onArchive: { channelToArchive = ChannelActionTarget(channel: $0) },
                onCancelTask: { updateStatus(for: $0, status: .cancelled) },
                onCompleteTask: { updateStatus(for: $0, status: .completed) },
                onEditAssignees: { channelToEdit = $0 },
                onEditLatestInfo: { channelLatestInfoToEdit = $0 },
                onEditTask: { editingTask = TaskEditTarget(task: $0.task) },
                onReactivate: {
                    updateChannel(
                        $0,
                        input: PatchChannelInput(status: .active)
                    )
                },
                onReopenTask: { updateStatus(for: $0, status: .active) },
                onDeleteBlock: { blockToDelete = $0 },
                onEditBlock: { blockToEdit = $0 },
                onResolveBlock: resolveBlock
            )
        }
    }

    var adminSetupSection: some View {
        HomeSection(
            "Workspace setup",
            systemImage: "person.badge.shield.checkmark"
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Set up the first administrator.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button {
                    router.navigate(to: .settings(workspaceId: workspaceId))
                } label: {
                    Label("Open settings", systemImage: "arrow.right.circle.fill")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.vertical, 8)
        }
    }
}

struct WorkspaceHomeScheduleRow: View {
    let snapshot: HomeSnapshot
    let onAdjustSchedule: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "phone.arrow.up.right")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ExeColors.accent)
                .frame(width: 22, height: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(snapshot.nextCallTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(snapshot.scheduleText)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button(action: onAdjustSchedule) {
                Image(systemName: "calendar.badge.clock")
                    .font(.headline.weight(.semibold))
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(ExeColors.accent)
            .accessibilityLabel("Adjust call schedule")
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}

struct WorkspaceHomeChannelList: View {
    let channels: [Channel]
    let isSavingBlockId: String?
    let isSavingChannelId: SlackChannelID?
    let isSavingTaskId: String?
    let members: [SlackWorkspaceMember]
    let snapshot: HomeSnapshot
    let onArchive: (Channel) -> Void
    let onCancelTask: (TaskActionTarget) -> Void
    let onCompleteTask: (TaskActionTarget) -> Void
    let onEditAssignees: (Channel) -> Void
    let onEditLatestInfo: (Channel) -> Void
    let onEditTask: (TaskActionTarget) -> Void
    let onReactivate: (Channel) -> Void
    let onReopenTask: (TaskActionTarget) -> Void
    let onDeleteBlock: (ChannelBlock) -> Void
    let onEditBlock: (ChannelBlock) -> Void
    let onResolveBlock: (ChannelBlock) -> Void

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(channels.enumerated()), id: \.element.id) { index, channel in
                WorkspaceHomeChannelSection(
                    assignedTasks: snapshot.assignedWorkTasks(for: channel),
                    blocks: snapshot.activeBlocks(for: channel),
                    channel: channel,
                    isSavingBlockId: isSavingBlockId,
                    isSavingChannel: isSavingChannelId == channel.id,
                    isSavingTaskId: isSavingTaskId,
                    members: members,
                    requestedTasks: snapshot.requestedWorkTasks(for: channel),
                    reviewStates: snapshot.reviewStates(for: channel),
                    schedule: snapshot,
                    onArchive: { onArchive(channel) },
                    onEditAssignees: { onEditAssignees(channel) },
                    onEditLatestInfo: { onEditLatestInfo(channel) },
                    onReactivate: { onReactivate(channel) },
                    onCancelTask: onCancelTask,
                    onCompleteTask: onCompleteTask,
                    onEditTask: onEditTask,
                    onReopenTask: onReopenTask,
                    onDeleteBlock: onDeleteBlock,
                    onEditBlock: onEditBlock,
                    onResolveBlock: onResolveBlock
                )

                if index < channels.count - 1 {
                    Divider()
                }
            }
        }
    }
}

struct WorkspaceHomeEmptyChannelsNotice: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("No channels to show yet", systemImage: "number")
                .font(.body.weight(.semibold))
            Text("When @exe is mentioned in Slack, updates and tasks for that channel appear here.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .overlay(alignment: .top) {
            Divider()
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}
