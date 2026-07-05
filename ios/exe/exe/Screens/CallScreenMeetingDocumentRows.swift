import ExeUI
import SwiftUI

struct AgendaDocumentRow: View {
    let row: AgendaDocumentRowModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if row.isCompletion {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ExeColors.success)
                }
                Text(row.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }

            if !row.detailLines.isEmpty {
                TaskDetailLines(lines: row.detailLines)
            }

            if !row.isCompletion, !row.diffRows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(row.diffRows) { diff in
                        DiffDocumentLine(row: diff)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    ExeColors.accent.opacity(0.06),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(row.hasChange ? 12 : 0)
        .background {
            if row.hasChange {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                row.isCompletion
                                    ? ExeColors.success.opacity(0.30)
                                    : ExeColors.accent.opacity(0.30),
                                lineWidth: 1
                            )
                    }
            }
        }
    }
}

struct TaskDetailLine: Hashable, Identifiable {
    let label: String
    let value: String

    var id: String {
        "\(label):\(value)"
    }
}

struct TaskDetailLines: View {
    let lines: [TaskDetailLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(lines) { line in
                (Text("\(line.label): ")
                    .fontWeight(.semibold)
                    + Text(line.value))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

struct LatestInfoRow: View {
    let channelName: String
    let latestInfo: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(channelName)
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
            Text(latestInfo)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }
}

struct ProposedLatestInfoRow: View {
    let latestInfo: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(String(localized: "Will update to this after the call"), systemImage: "sparkles")
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
            Text(latestInfo)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
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

struct ConfirmationDocumentRow: View {
    let assignees: String
    let question: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text("Confirm with \(assignees)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(question)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }
}

struct DocumentBlock<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder
    let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ExeColors.accent)
                    .frame(width: 20)
                Text(title)
                    .font(.headline.weight(.bold))
                Spacer(minLength: 0)
            }
            content
                .padding(.leading, 2)
        }
        .padding(.top, 2)
    }
}

struct DocumentEmptyLine: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
    }
}
