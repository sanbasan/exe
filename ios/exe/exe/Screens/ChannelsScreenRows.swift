import ExeDomain
import SwiftUI

struct ChannelManagementRowState {
    let channel: Channel
    var isSaving = false
    var watchBinding: Binding<Bool>?
}

struct ChannelManagementRow<MenuContent: View>: View {
    let menuContent: (() -> MenuContent)?
    let state: ChannelManagementRowState

    init(_ state: ChannelManagementRowState) where MenuContent == EmptyView {
        self.state = state
        menuContent = nil
    }

    init(
        _ state: ChannelManagementRowState,
        @ViewBuilder menuContent: @escaping () -> MenuContent
    ) {
        self.state = state
        self.menuContent = menuContent
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ChannelManagementSummary(channel: state.channel)
            Spacer(minLength: 0)
            if let watchBinding = state.watchBinding {
                Toggle("Review", isOn: watchBinding)
                    .labelsHidden()
                    .disabled(state.isSaving)
            }
            if let menuContent {
                Menu {
                    menuContent()
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(state.isSaving)
                .accessibilityLabel("Channel menu")
            }
        }
        .padding(.vertical, 8)
    }
}

private struct ChannelManagementSummary: View {
    let channel: Channel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("#\(channel.name)")
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            if let subtitle {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
    }

    private var subtitle: String? {
        guard
            let latestInfo = channel.latestInfo?.trimmingCharacters(in: .whitespacesAndNewlines),
            !latestInfo.isEmpty
        else {
            return nil
        }

        return latestInfo
    }
}
