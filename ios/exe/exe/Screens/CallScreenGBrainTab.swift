import ExeDomain
import ExeUI
import SwiftUI

/// Shared accent→purple visuals that set the GBrain tab apart from the
/// channel-oriented meeting note tabs.
enum GBrainCallVisual {
    static let purple = Color(red: 0.55, green: 0.35, blue: 0.95)

    static var gradient: LinearGradient {
        LinearGradient(
            colors: [ExeColors.accent, purple],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var borderGradient: LinearGradient {
        LinearGradient(
            colors: [ExeColors.accent.opacity(0.55), purple.opacity(0.55)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var cardFill: LinearGradient {
        LinearGradient(
            colors: [ExeColors.accent.opacity(0.06), purple.opacity(0.09)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/// Real-time feed of the workspace long-term memory (GBrain) lookups the call
/// agent runs. One card per lookup, showing the query plus the agent's
/// human-readable digest — never raw slugs, snippets, or IDs. Deliberately
/// styled apart from the channel tabs: purple accents and a card-based layout.
struct GBrainCallTab: View {
    let lookups: [GBrainCallLookupActivity]
    let channelName: (SlackChannelID) -> String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(lookups.reversed())) { lookup in
                GBrainLookupCard(lookup: lookup, channelName: channelName)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct GBrainLookupCard: View {
    let lookup: GBrainCallLookupActivity
    let channelName: (SlackChannelID) -> String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            queryRow
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(GBrainCallVisual.cardFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(GBrainCallVisual.borderGradient, lineWidth: 1.5)
        )
    }

    @ViewBuilder
    private var queryRow: some View {
        if let query = lookup.searches.last?.query {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GBrainCallVisual.purple)

                Text(query)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 4)

                channelChip
            }
        }
    }

    @ViewBuilder
    private var channelChip: some View {
        if let channelId = lookup.channelId, let name = channelName(channelId) {
            Text("#\(name)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(GBrainCallVisual.purple)
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(GBrainCallVisual.purple.opacity(0.12)))
        }
    }

    @ViewBuilder
    private var content: some View {
        if let bullets = lookup.bullets, !bullets.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(bullets.enumerated()), id: \.offset) { _, bullet in
                    Text("•  " + bullet)
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        } else if isSearching {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text(String(localized: "Searching…"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } else if hasError {
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle")
                Text(String(localized: "Search failed"))
            }
            .font(.subheadline)
            .foregroundStyle(ExeColors.warning)
        } else {
            Text(String(localized: "No summary available"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var isSearching: Bool {
        lookup.searches.contains { $0.state == .searching }
    }

    private var hasError: Bool {
        lookup.searches.contains { $0.state == .error }
    }
}

#if DEBUG
enum GBrainCallTabPreviewData {
    static let channelNames: [SlackChannelID: String] = ["C0123ABCDEF": "dev-exe"]

    static let samples: [GBrainCallLookupActivity] = [
        GBrainCallLookupActivity(
            id: "L1",
            channelId: "C0123ABCDEF",
            searches: [
                .init(id: "s1", query: "ABCプロジェクト リニューアル 決定事項", state: .ok),
                .init(id: "s2", query: "ABCプロジェクト 納期 変更", state: .ok)
            ],
            bullets: [
                "6/15の通話でリニューアル納期を7月末に後ろ倒しすることを決定",
                "デザインの最終確認は次回の定例で実施する方針で合意",
                "コスト増分は次回見積もりで再提示する予定"
            ]
        ),
        GBrainCallLookupActivity(
            id: "L2",
            searches: [.init(id: "s3", query: "前回の見積もり 金額", state: .ok)],
            bullets: ["前回見積もりは総額240万円で提示済み"]
        ),
        GBrainCallLookupActivity(
            id: "L3",
            channelId: "C0123ABCDEF",
            searches: [.init(id: "s4", query: "次回定例 アジェンダ候補", state: .searching)]
        ),
        GBrainCallLookupActivity(
            id: "L4",
            searches: [.init(id: "s5", query: "セキュリティ監査 ログ保管", state: .ok)]
        ),
        GBrainCallLookupActivity(
            id: "L5",
            searches: [.init(id: "s6", query: "契約更新 期日", state: .error)]
        )
    ]
}

#Preview("GBrain Tab") {
    ScrollView {
        GBrainCallTab(
            lookups: GBrainCallTabPreviewData.samples,
            channelName: { GBrainCallTabPreviewData.channelNames[$0] }
        )
        .padding(18)
    }
    .background(ExeColors.background)
    .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
