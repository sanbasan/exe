import ExeDomain
import ExeUI
import SwiftUI

/// Trailing tab for changes not tied to one of the user's channels.
struct OtherItemsTab: View {
    let diffBuilder: PatchDiffBuilder
    let drafts: [FollowUpTaskDraft]
    let memberLabel: (SlackUserID) -> String
    let patches: [TaskPatch]
    let title: (String) -> String?
    let workDrafts: [WorkTaskDraft]

    var body: some View {
        DocumentBlock(title: String(localized: "Other changes"), systemImage: "tray.full") {
            if patches.isEmpty, drafts.isEmpty, workDrafts.isEmpty {
                DocumentEmptyLine(String(localized: "There are no changes that aren't tied to a channel."))
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(patches.enumerated()), id: \.offset) { _, patch in
                        AgendaDocumentRow(row: patchRow(patch))
                    }
                    ForEach(Array(drafts.enumerated()), id: \.offset) { _, draft in
                        ConfirmationDocumentRow(
                            assignees: assigneeNames(draft.assigneeSlackUserIds),
                            question: draft.followUpQuestion,
                            title: draft.title
                        )
                    }
                    ForEach(Array(workDrafts.enumerated()), id: \.offset) { _, draft in
                        AgendaDocumentRow(row: workDraftRow(draft))
                    }
                }
            }
        }
    }

    private func patchRow(_ patch: TaskPatch) -> AgendaDocumentRowModel {
        let resolvedTitle = title(patch.taskId) ?? patchTitle(patch) ?? String(localized: "Update task")
        return AgendaDocumentRowModel(
            id: "patch-\(patch.taskId)",
            detailLines: [],
            title: resolvedTitle,
            diffRows: diffBuilder.diffRows(for: patch),
            isCompletion: diffBuilder.isCompletion(patch)
        )
    }

    private func patchTitle(_ patch: TaskPatch) -> String? {
        switch patch.after {
            case let .followUp(after):
                after.title
            case let .work(after):
                after.title
        }
    }

    private func workDraftRow(_ draft: WorkTaskDraft) -> AgendaDocumentRowModel {
        AgendaDocumentRowModel(
            id: "work-draft-\(draft.title)-\(draft.assigneeSlackUserIds.joined(separator: "-"))",
            detailLines: [
                TaskDetailLine(
                    label: "Due at",
                    value: draft.dueAt.map { ExeDateFormatting.displayString(isoDateTime: $0) } ?? "None"
                ),
                TaskDetailLine(label: "Requested by", value: names(draft.requesterSlackUserIds, fallback: "Unknown")),
                TaskDetailLine(label: "Assignees", value: names(draft.assigneeSlackUserIds, fallback: "Unassigned"))
            ],
            title: draft.title,
            diffRows: [],
            isCompletion: false
        )
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
