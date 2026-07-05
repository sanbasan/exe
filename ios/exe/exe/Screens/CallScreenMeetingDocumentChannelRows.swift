import ExeDomain
import ExeUI
import SwiftUI

struct BlockRow: View {
    let block: ChannelBlock

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "hand.raised.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ExeColors.warning)
                Text(block.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            if !block.description.meetingTrimmed.isEmpty, block.description != block.title {
                Text(block.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            ExeColors.warning.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }
}

/// Caption annotation shown directly under an existing block when a draft will
/// resolve, delete, or update it after the call.
struct BlockDraftAnnotation: View {
    let draft: ChannelBlockDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(labelText, systemImage: "sparkles")
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
            if draft.action == .update {
                if let title = draft.title, !title.meetingTrimmed.isEmpty {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let description = draft.description, !description.meetingTrimmed.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 12)
    }

    private var labelText: String {
        switch draft.action {
            case .create:
                String(localized: "Will be added after the call")
            case .delete:
                String(localized: "Will be deleted after the call")
            case .resolve:
                String(localized: "Will be resolved after the call")
            case .update:
                String(localized: "Will be updated after the call")
        }
    }
}

/// Accent-framed preview for a block that will be created after the call.
struct ProposedBlockRow: View {
    let draft: ChannelBlockDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(String(localized: "Will be added after the call"), systemImage: "sparkles")
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
            if let title = draft.title, !title.meetingTrimmed.isEmpty {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let description = draft.description, !description.meetingTrimmed.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ExeColors.accent.opacity(0.30), lineWidth: 1)
        }
    }
}

struct OtherTaskRow: View {
    let task: WorkTask
    let memberLabel: (SlackUserID) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(task.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            TaskDetailLines(lines: detailLines)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }

    private var detailLines: [TaskDetailLine] {
        [
            TaskDetailLine(label: "Due at", value: dueAtLabel),
            TaskDetailLine(label: "Requested by", value: names(task.requesterSlackUserIds, fallback: "Unknown")),
            TaskDetailLine(label: "Assignees", value: names(task.assigneeSlackUserIds, fallback: "Unassigned"))
        ]
    }

    private var dueAtLabel: String {
        task.dueAt.map { ExeDateFormatting.displayString(isoDateTime: $0) } ?? "None"
    }

    private func names(_ ids: [SlackUserID], fallback: String) -> String {
        guard !ids.isEmpty else { return fallback }
        return ids.map(memberLabel).joined(separator: "、")
    }
}

struct MarkdownTextBlock: View {
    let text: String

    var body: some View {
        Text(attributed)
            .font(.subheadline)
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
    }

    private var attributed: AttributedString {
        (try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)
    }
}

struct AgendaDocumentRowModel: Identifiable {
    let id: String
    let detailLines: [TaskDetailLine]
    let title: String
    let diffRows: [PatchDiffRow]
    let isCompletion: Bool

    var hasChange: Bool {
        isCompletion || !diffRows.isEmpty
    }
}

extension String {
    var meetingTrimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
