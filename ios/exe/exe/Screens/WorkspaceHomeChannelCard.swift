import ExeDomain
import ExeUI
import SwiftUI

struct WorkspaceHomeChannelSection: View {
    let assignedTasks: [WorkTask]
    let blocks: [ChannelBlock]
    let channel: Channel
    let isSavingBlockId: String?
    let isSavingChannel: Bool
    let isSavingTaskId: String?
    let members: [SlackWorkspaceMember]
    let requestedTasks: [WorkTask]
    let reviewStates: [ChannelReviewState]
    let schedule: HomeSnapshot
    let onArchive: () -> Void
    let onEditAssignees: () -> Void
    let onEditLatestInfo: () -> Void
    let onReactivate: () -> Void
    let onCancelTask: (TaskActionTarget) -> Void
    let onCompleteTask: (TaskActionTarget) -> Void
    let onEditTask: (TaskActionTarget) -> Void
    let onReopenTask: (TaskActionTarget) -> Void
    let onDeleteBlock: (ChannelBlock) -> Void
    let onEditBlock: (ChannelBlock) -> Void
    let onResolveBlock: (ChannelBlock) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if let latestInfoText {
                WorkspaceHomeLatestInfoRow(text: latestInfoText)
            }

            if !reviewStates.isEmpty {
                reviewStateRows
            }

            if !assignedTasks.isEmpty {
                taskRows(title: String(localized: "Assigned tasks"), systemImage: "checklist", tasks: assignedTasks)
            }

            if !blocks.isEmpty {
                blockRows
            }

            if !requestedTasks.isEmpty {
                taskRows(title: String(localized: "Requested tasks"), systemImage: "paperplane", tasks: requestedTasks)
            }
        }
        .padding(.vertical, 8)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("#\(channel.name)")
                .font(.headline.weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            channelMenu
        }
        .padding(.vertical, 4)
    }

    private var blockRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            WorkspaceHomeInlineHeading(title: String(localized: "Blocks"), systemImage: "hand.raised")
            ForEach(Array(blocks.enumerated()), id: \.element.id) { index, block in
                WorkspaceHomeBlockRow(
                    block: block,
                    isSaving: isSavingBlockId == block.id,
                    onDelete: { onDeleteBlock(block) },
                    onEdit: { onEditBlock(block) },
                    onResolve: { onResolveBlock(block) }
                )
                if index < blocks.count - 1 {
                    Divider()
                }
            }
        }
    }

    private var reviewStateRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            WorkspaceHomeInlineHeading(title: String(localized: "Individual status"), systemImage: "person.2")
            ForEach(Array(reviewStates.enumerated()), id: \.element.id) { index, state in
                WorkspaceHomeReviewStateRow(
                    dateText: schedule.reviewStateDateText(state),
                    name: memberDisplayName(for: state.slackUserId),
                    text: schedule.reviewStateBody(state) ?? ""
                )
                if index < reviewStates.count - 1 {
                    Divider()
                }
            }
        }
    }

    private func memberDisplayName(for slackUserId: SlackUserID) -> String {
        members.first { $0.slackId == slackUserId }?.displayName ?? slackUserId
    }

    private var channelMenu: some View {
        Menu {
            Button(action: onEditLatestInfo) {
                Label("Edit latest info", systemImage: "doc.text")
            }
            Button(action: onEditAssignees) {
                Label("Edit assignees", systemImage: "person.2.badge.gearshape")
            }
            if channel.status == .archived {
                Button(action: onReactivate) {
                    Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                }
            } else {
                Button(role: .destructive, action: onArchive) {
                    Label("Archive", systemImage: "archivebox")
                }
            }
        } label: {
            if isSavingChannel {
                ProgressView()
                    .frame(width: 36, height: 36)
            } else {
                Image(systemName: "ellipsis")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        .disabled(isSavingChannel)
        .accessibilityLabel("Channel menu")
    }

    private var latestInfoText: String? {
        guard let latestInfo = channel.latestInfo?.homeTrimmed, !latestInfo.isEmpty else {
            return nil
        }

        return latestInfo
    }

    private func taskRows(title: String, systemImage: String, tasks: [WorkTask]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WorkspaceHomeInlineHeading(title: title, systemImage: systemImage)
            ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                let target = TaskActionTarget(task: .work(task))
                WorkspaceHomeTaskRow(
                    isSaving: isSavingTaskId == task.id,
                    subtitle: schedule.dueAtText(task.dueAt),
                    target: target,
                    title: task.title,
                    onCancel: { onCancelTask(target) },
                    onComplete: { onCompleteTask(target) },
                    onEdit: { onEditTask(target) },
                    onReopen: { onReopenTask(target) }
                )
                if index < tasks.count - 1 {
                    Divider()
                }
            }
        }
    }
}
