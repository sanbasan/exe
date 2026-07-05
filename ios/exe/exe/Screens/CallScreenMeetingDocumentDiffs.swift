import ExeDomain
import ExeUI
import SwiftUI

struct PatchDiffBuilder {
    let channelLabel: (SlackChannelID) -> String
    let memberLabel: (SlackUserID) -> String
    let taskStatusLabel: (TaskStatus) -> String

    func isCompletion(_ patch: TaskPatch) -> Bool {
        switch patch.after {
            case let .followUp(after):
                after.status == .completed
            case let .work(after):
                after.status == .completed
        }
    }

    func diffRows(for patch: TaskPatch) -> [PatchDiffRow] {
        switch (patch.before, patch.after) {
            case let (.followUp(before), .followUp(after)):
                followUpRows(before: before, after: after)
            case let (.work(before), .work(after)):
                workRows(before: before, after: after)
            case let (nil, .followUp(after)):
                followUpRows(before: nil, after: after)
            case let (nil, .work(after)):
                workRows(before: nil, after: after)
            default:
                []
        }
    }

    private func workRows(before: WorkTaskPatch?, after: WorkTaskPatch) -> [PatchDiffRow] {
        [
            diffRow("Title", before?.title, after.title),
            dueDiffRow(before: before, after: after),
            diffRow("Status", before?.status.map(taskStatusLabel), after.status.map(taskStatusLabel)),
            diffRow("Channel", before?.channelId.map(channelLabel), after.channelId.map(channelLabel)),
            memberDiffRow("Assigned to", before?.assigneeSlackUserIds, after.assigneeSlackUserIds),
            memberDiffRow("Requester", before?.requesterSlackUserIds, after.requesterSlackUserIds)
        ].compactMap(\.self)
    }

    private func dueDiffRow(before: WorkTaskPatch?, after: WorkTaskPatch) -> PatchDiffRow? {
        guard after.clearsDueAt else {
            return diffRow("Due", dateLabel(before?.dueAt), dateLabel(after.dueAt))
        }
        return PatchDiffRow(
            label: String(localized: "Due"),
            before: dateLabel(before?.dueAt),
            after: String(localized: "None")
        )
    }

    private func followUpRows(before: FollowUpTaskPatch?, after: FollowUpTaskPatch) -> [PatchDiffRow] {
        [
            diffRow("Title", before?.title, after.title),
            diffRow("Question", before?.followUpQuestion, after.followUpQuestion),
            diffRow("Answer", before?.followUpAnswer, after.followUpAnswer),
            diffRow("Status", before?.status.map(taskStatusLabel), after.status.map(taskStatusLabel)),
            diffRow("Channel", before?.channelId.map(channelLabel), after.channelId.map(channelLabel)),
            memberDiffRow("Assigned to", before?.assigneeSlackUserIds, after.assigneeSlackUserIds),
            memberDiffRow("Requester", before?.requesterSlackUserIds, after.requesterSlackUserIds)
        ].compactMap(\.self)
    }

    private func diffRow(_ label: LocalizedStringResource, _ before: String?, _ after: String?) -> PatchDiffRow? {
        guard let after, !after.isEmpty, before != after else { return nil }
        return PatchDiffRow(label: String(localized: label), before: before, after: after)
    }

    private func memberDiffRow(
        _ label: LocalizedStringResource,
        _ before: [SlackUserID]?,
        _ after: [SlackUserID]?
    ) -> PatchDiffRow? {
        guard let after, !after.isEmpty, before != after else { return nil }
        let beforeLabel = before?.map(memberLabel).joined(separator: "、")
        let afterLabel = after.map(memberLabel).joined(separator: "、")
        return PatchDiffRow(label: String(localized: label), before: beforeLabel, after: afterLabel)
    }

    private func dateLabel(_ isoDateTime: DateTime?) -> String? {
        isoDateTime.map { ExeDateFormatting.displayString(isoDateTime: $0) }
    }
}

struct PatchDiffRow: Identifiable {
    let id = UUID()
    let label: String
    let before: String?
    let after: String
}

struct DiffDocumentLine: View {
    let row: PatchDiffRow

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(row.label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    beforeValue
                    arrow(systemName: "arrow.right")
                    afterValue
                }

                VStack(alignment: .leading, spacing: 5) {
                    beforeValue
                    arrow(systemName: "arrow.down")
                    afterValue
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var beforeValue: some View {
        Text(row.before ?? String(localized: "None"))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .strikethrough(row.before != nil, color: .secondary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var afterValue: some View {
        Text(row.after)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func arrow(systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.caption.weight(.bold))
            .foregroundStyle(ExeColors.accent)
    }
}
