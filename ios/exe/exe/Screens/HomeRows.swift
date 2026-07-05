import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct HomeSection<Content: View>: View {
    let systemImage: String
    let title: LocalizedStringKey
    @ViewBuilder
    let content: Content

    init(
        _ title: LocalizedStringKey,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) {
        self.systemImage = systemImage
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ExeColors.accent)
                    .frame(width: 20)
                Text(title)
                    .font(.title3.weight(.bold))
            }

            VStack(spacing: 0) {
                content
            }
            .padding(.horizontal, 16)
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
        }
    }
}

struct HomeEmptyRow: View {
    let message: LocalizedStringKey
    let systemImage: String

    var body: some View {
        Label(message, systemImage: systemImage)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 14)
    }
}

/// Lays out home rows like an inset grouped list: a hairline separator is drawn
/// between rows only (never after the last row), so it never bleeds past the
/// rounded container corners.
struct HomeRowGroup<Item: Identifiable, RowContent: View>: View {
    let items: [Item]
    @ViewBuilder
    let row: (Item) -> RowContent

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                row(item)
                if index < items.count - 1 {
                    Divider()
                }
            }
        }
    }
}

struct HomeTaskRow: View {
    let isOpen: Bool
    let isSaving: Bool
    let onCancel: () -> Void
    let onComplete: () -> Void
    let onEdit: () -> Void
    let subtitle: String?
    let title: String
    let onReopen: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            Menu {
                if isOpen {
                    Button { onComplete() } label: {
                        Label("Complete", systemImage: "checkmark.circle")
                    }
                    Button { onEdit() } label: {
                        Label("Edit", systemImage: "square.and.pencil")
                    }
                    Button(role: .destructive) { onCancel() } label: {
                        Label("Cancel", systemImage: "xmark.circle")
                    }
                } else {
                    Button { onReopen() } label: {
                        Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
            .accessibilityLabel("Task menu")
        }
        .padding(.vertical, 13)
    }
}

struct HomeChannelRow<MenuContent: View>: View {
    let channel: Channel
    private let menuContent: (() -> MenuContent)?

    init(channel: Channel) where MenuContent == EmptyView {
        self.channel = channel
        menuContent = nil
    }

    init(
        channel: Channel,
        @ViewBuilder menuContent: @escaping () -> MenuContent
    ) {
        self.channel = channel
        self.menuContent = menuContent
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text("#\(channel.name)")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            if let menuContent {
                Menu {
                    menuContent()
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Channel menu")
            }
        }
        .padding(.vertical, 13)
    }

    private var subtitle: String {
        if let latestInfo = channel.latestInfo, !latestInfo.isEmpty {
            return latestInfo
        }

        if channel.assigneeSlackUserIds.isEmpty {
            return String(localized: "No assignee")
        }

        return String(localized: "Assignee set")
    }
}
