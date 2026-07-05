import ExeDomain
import ExeUI
import SwiftUI

struct WorkspaceHomeInlineHeading: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.bold))
            .foregroundStyle(ExeColors.accent)
            .padding(.top, 6)
            .padding(.bottom, 2)
    }
}

struct WorkspaceHomeLatestInfoRow: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "doc.text")
                .font(.caption.weight(.bold))
                .foregroundStyle(ExeColors.accent)
                .frame(width: 14)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 5)
    }
}

struct WorkspaceHomeReviewStateRow: View {
    let dateText: String?
    let name: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                if let dateText {
                    Text(dateText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
    }
}

struct WorkspaceHomeBlockRow: View {
    let block: ChannelBlock
    let isSaving: Bool
    let onDelete: () -> Void
    let onEdit: () -> Void
    let onResolve: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(block.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if !block.description.homeTrimmed.isEmpty, block.description != block.title {
                    Text(block.description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 0)

            Menu {
                Button(action: onResolve) {
                    Label("Resolve", systemImage: "checkmark.circle")
                }
                Button(action: onEdit) {
                    Label("Edit", systemImage: "square.and.pencil")
                }
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                if isSaving {
                    ProgressView()
                        .frame(width: 34, height: 34)
                } else {
                    Image(systemName: "ellipsis")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel("Block menu")
        }
        .padding(.vertical, 6)
    }
}

struct WorkspaceHomeTaskRow: View {
    let isSaving: Bool
    let subtitle: String?
    let target: TaskActionTarget
    let title: String
    let onCancel: () -> Void
    let onComplete: () -> Void
    let onEdit: () -> Void
    let onReopen: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 0)

            Menu {
                if target.isOpen {
                    Button(action: onComplete) {
                        Label("Complete", systemImage: "checkmark.circle")
                    }
                    Button(action: onEdit) {
                        Label("Edit", systemImage: "square.and.pencil")
                    }
                    Button(role: .destructive, action: onCancel) {
                        Label("Cancel", systemImage: "xmark.circle")
                    }
                } else {
                    Button(action: onReopen) {
                        Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                    }
                }
            } label: {
                if isSaving {
                    ProgressView()
                        .frame(width: 34, height: 34)
                } else {
                    Image(systemName: "ellipsis")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel("Task menu")
        }
        .padding(.vertical, 6)
    }
}

extension String {
    var homeTrimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
