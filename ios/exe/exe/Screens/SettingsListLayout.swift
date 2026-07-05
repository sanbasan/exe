import ExeUI
import SwiftUI

struct SettingsListContent<Content: View>: View {
    let bottomPadding: CGFloat
    let content: Content

    init(
        bottomPadding: CGFloat = 24,
        @ViewBuilder content: () -> Content
    ) {
        self.bottomPadding = bottomPadding
        self.content = content()
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, bottomPadding)
        }
        .scrollContentBackground(.hidden)
        .background(ExeColors.background.ignoresSafeArea())
    }
}

struct SettingsPlainSection<Content: View>: View {
    let footer: LocalizedStringKey?
    let title: LocalizedStringKey?
    let content: Content

    init(
        _ title: LocalizedStringKey? = nil,
        footer: LocalizedStringKey? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.footer = footer
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 2)
            }

            VStack(spacing: 0) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 2)
            .background {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(ExeColors.border, lineWidth: 1)
            }

            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 2)
            }
        }
    }
}

struct SettingsDividedRows<Item: Identifiable, RowContent: View>: View {
    let items: [Item]
    let row: (Item) -> RowContent

    init(
        _ items: [Item],
        @ViewBuilder row: @escaping (Item) -> RowContent
    ) {
        self.items = items
        self.row = row
    }

    var body: some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            row(item)
            if index < items.count - 1 {
                Divider()
            }
        }
    }
}

struct SettingsInlineMessage: View {
    let message: String
    let style: Style

    enum Style {
        case error
        case success
    }

    init(_ message: String, style: Style) {
        self.message = message
        self.style = style
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: systemImage)
                .font(.footnote.weight(.semibold))
                .frame(width: 16)
            Text(message)
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(foregroundStyle)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
    }

    private var foregroundStyle: Color {
        switch style {
            case .error:
                .red
            case .success:
                ExeColors.success
        }
    }

    private var systemImage: String {
        switch style {
            case .error:
                "exclamationmark.triangle"
            case .success:
                "checkmark.circle"
        }
    }
}

struct SettingsNavigationRow: View {
    let systemImage: String
    let subtitle: LocalizedStringKey?
    let title: LocalizedStringKey

    init(
        _ title: LocalizedStringKey,
        systemImage: String,
        subtitle: LocalizedStringKey? = nil
    ) {
        self.systemImage = systemImage
        self.subtitle = subtitle
        self.title = title
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ExeColors.accent)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}
