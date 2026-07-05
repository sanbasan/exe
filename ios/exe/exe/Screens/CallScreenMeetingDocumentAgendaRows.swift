// swiftlint:disable file_length
import ExeDomain
import ExeUI
import SwiftUI

/// Content for a single channel tab in the in-call meeting note.
struct ChannelReviewTab: View {
    let item: ChannelReviewAgendaItem
    let diffBuilder: PatchDiffBuilder
    let drafts: [FollowUpTaskDraft]
    let latestPatches: [String: TaskPatch]
    let memberLabel: (SlackUserID) -> String
    var proposedBlockDrafts: [ChannelBlockDraft] = []
    let proposedLatestInfoDraft: LatestInfoDraft?
    var proposedReviewDraft: ChannelReviewDraft?
    let workDrafts: [WorkTaskDraft]

    var body: some View {
        currentStateBlock
        statusBlock
        nextCheckBlock
        myTasksBlock
        newTasksBlock
        completedBlock
        blocksBlock
        otherTasksBlock
        confirmationBlock
    }

    @ViewBuilder
    private var newTasksBlock: some View {
        if !workDrafts.isEmpty {
            DocumentBlock(title: String(localized: "New tasks"), systemImage: "plus.circle") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(workDrafts.enumerated()), id: \.offset) { _, draft in
                        AgendaDocumentRow(row: workDraftRow(draft))
                    }
                }
            }
        }
    }

    private var currentStateBlock: some View {
        DocumentBlock(title: String(localized: "Channel status"), systemImage: "clock.badge.checkmark") {
            VStack(alignment: .leading, spacing: 10) {
                if let latestInfo = item.channel.latestInfo, !latestInfo.meetingTrimmed.isEmpty {
                    LatestInfoRow(channelName: "#\(item.channel.name)", latestInfo: latestInfo)
                } else {
                    DocumentEmptyLine(String(localized: "No recent updates recorded for this channel yet."))
                }
                if
                    let proposed = proposedLatestInfoDraft,
                    !proposed.latestInfo.meetingTrimmed.isEmpty,
                    proposed.latestInfo.meetingTrimmed != (item.channel.latestInfo?.meetingTrimmed ?? "")
                {
                    ProposedLatestInfoRow(latestInfo: proposed.latestInfo)
                }
            }
        }
    }

    private var statusBlock: some View {
        DocumentBlock(title: String(localized: "My review status"), systemImage: "doc.text") {
            VStack(alignment: .leading, spacing: 10) {
                if let statusText = item.reviewState?.statusText, !statusText.meetingTrimmed.isEmpty {
                    MarkdownTextBlock(text: statusText)
                } else {
                    DocumentEmptyLine(String(localized: "The AI will summarize the status at the end of the review."))
                }
                if
                    let draft = proposedReviewDraft,
                    !draft.statusText.meetingTrimmed.isEmpty,
                    draft.statusText.meetingTrimmed != (item.reviewState?.statusText?.meetingTrimmed ?? "")
                {
                    ProposedLatestInfoRow(latestInfo: draft.statusText)
                }
            }
        }
    }

    private var nextCheckBlock: some View {
        DocumentBlock(title: String(localized: "Next review"), systemImage: "calendar") {
            VStack(alignment: .leading, spacing: 10) {
                if let nextCheckAt = item.reviewState?.nextCheckAt {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(ExeDateFormatting.displayString(isoDateTime: nextCheckAt))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        if let reason = item.reviewState?.nextCheckReason, !reason.meetingTrimmed.isEmpty {
                            Text("Reason: \(reason)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    DocumentEmptyLine(String(localized: "You'll decide when to check next during this call."))
                }
                if let nextCheckAt = proposedReviewDraft?.nextCheckAt, !nextCheckAt.meetingTrimmed.isEmpty {
                    proposedNextCheckRow(nextCheckAt: nextCheckAt)
                }
            }
        }
    }

    private func proposedNextCheckRow(nextCheckAt: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(String(localized: "Will update to this after the call"), systemImage: "sparkles")
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
            Text(ExeDateFormatting.displayString(isoDateTime: nextCheckAt))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            if let reason = proposedReviewDraft?.nextCheckReason, !reason.meetingTrimmed.isEmpty {
                Text("Reason: \(reason)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var myTasksBlock: some View {
        DocumentBlock(title: String(localized: "My tasks"), systemImage: "checklist") {
            if item.assignedWorkTasks.isEmpty {
                DocumentEmptyLine(String(localized: "You have no open tasks of your own."))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(item.assignedWorkTasks) { task in
                        AgendaDocumentRow(row: workRow(task))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var completedBlock: some View {
        if !item.completedWorkTasksSinceLastCheck.isEmpty {
            DocumentBlock(title: String(localized: "Completed since last check"), systemImage: "checkmark.circle") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(item.completedWorkTasksSinceLastCheck) { task in
                        Label(task.title, systemImage: "checkmark")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var blocksBlock: some View {
        DocumentBlock(title: String(localized: "Blocked (waiting)"), systemImage: "hand.raised") {
            if item.activeBlocks.isEmpty, createBlockDrafts.isEmpty {
                DocumentEmptyLine(String(localized: "Nothing is currently blocked."))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(item.activeBlocks) { block in
                        VStack(alignment: .leading, spacing: 6) {
                            BlockRow(block: block)
                            if let draft = blockDraft(forBlock: block.id) {
                                BlockDraftAnnotation(draft: draft)
                            }
                        }
                    }
                    ForEach(Array(createBlockDrafts.enumerated()), id: \.offset) { _, draft in
                        ProposedBlockRow(draft: draft)
                    }
                }
            }
        }
    }

    private var createBlockDrafts: [ChannelBlockDraft] {
        proposedBlockDrafts.filter { $0.action == .create }
    }

    private func blockDraft(forBlock blockId: String) -> ChannelBlockDraft? {
        proposedBlockDrafts.first { draft in
            draft.action != .create && draft.blockId == blockId
        }
    }

    @ViewBuilder
    private var otherTasksBlock: some View {
        if !item.otherActiveWorkTasks.isEmpty {
            DocumentBlock(title: String(localized: "Others' tasks"), systemImage: "person.2") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(item.otherActiveWorkTasks) { task in
                        OtherTaskRow(task: task, memberLabel: memberLabel)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var confirmationBlock: some View {
        if !drafts.isEmpty {
            DocumentBlock(title: String(localized: "Things to confirm"), systemImage: "questionmark.bubble") {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(drafts.enumerated()), id: \.offset) { _, draft in
                        ConfirmationDocumentRow(
                            assignees: assigneeNames(draft.assigneeSlackUserIds),
                            question: draft.followUpQuestion,
                            title: draft.title
                        )
                    }
                }
            }
        }
    }
}

private extension ChannelReviewTab {
    func workRow(_ task: WorkTask) -> AgendaDocumentRowModel {
        let patch = latestPatches[task.id]
        var title = task.title
        var dueAt = task.dueAt

        if case let .work(after) = patch?.after {
            title = after.title ?? title
            dueAt = after.clearsDueAt ? nil : (after.dueAt ?? dueAt)
        }

        return AgendaDocumentRowModel(
            id: task.id,
            detailLines: taskDetailLines(
                assigneeSlackUserIds: task.assigneeSlackUserIds,
                dueAt: dueAt,
                requesterSlackUserIds: task.requesterSlackUserIds
            ),
            title: title,
            diffRows: patch.map { diffBuilder.diffRows(for: $0) } ?? [],
            isCompletion: patch.map { diffBuilder.isCompletion($0) } ?? false
        )
    }

    private func workDraftRow(_ draft: WorkTaskDraft) -> AgendaDocumentRowModel {
        AgendaDocumentRowModel(
            id: "work-draft-\(draft.title)-\(draft.assigneeSlackUserIds.joined(separator: "-"))",
            detailLines: taskDetailLines(
                assigneeSlackUserIds: draft.assigneeSlackUserIds,
                dueAt: draft.dueAt,
                requesterSlackUserIds: draft.requesterSlackUserIds
            ),
            title: draft.title,
            diffRows: [],
            isCompletion: false
        )
    }

    private func taskDetailLines(
        assigneeSlackUserIds: [SlackUserID],
        dueAt: DateTime?,
        requesterSlackUserIds: [SlackUserID]
    ) -> [TaskDetailLine] {
        [
            TaskDetailLine(label: "Due at", value: dueAtLabel(dueAt)),
            TaskDetailLine(label: "Requested by", value: names(requesterSlackUserIds, fallback: "Unknown")),
            TaskDetailLine(label: "Assignees", value: names(assigneeSlackUserIds, fallback: "Unassigned"))
        ]
    }

    private func dueAtLabel(_ dueAt: DateTime?) -> String {
        dueAt.map { ExeDateFormatting.displayString(isoDateTime: $0) } ?? "None"
    }

    private func names(_ ids: [SlackUserID], fallback: String) -> String {
        guard !ids.isEmpty else { return fallback }
        return ids.map(memberLabel).joined(separator: "、")
    }

    private func assigneeNames(_ ids: [SlackUserID]?) -> String {
        guard let ids, !ids.isEmpty else { return String(localized: "Not yet decided") }
        return ids.map(memberLabel).joined(separator: "、")
    }
}
