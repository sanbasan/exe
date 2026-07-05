import ExeDomain
import SwiftUI

enum HuddleParticipantStyle {
    case appIcon
    case person
}

struct HuddleParticipantRowLayout: Layout {
    var maxTileSize: CGFloat = 210
    var spacing: CGFloat = 18

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache _: inout ()
    ) -> CGSize {
        let count = CGFloat(max(subviews.count, 1))
        let availableWidth = proposal.width ?? (maxTileSize * count + spacing * max(count - 1, 0))
        let tileSize = resolvedTileSize(width: availableWidth, count: count)

        return CGSize(width: availableWidth, height: tileSize)
    }

    // swiftlint:disable:next function_parameter_count
    func placeSubviews(
        in bounds: CGRect,
        proposal _: ProposedViewSize,
        subviews: Subviews,
        cache _: inout ()
    ) {
        let count = CGFloat(max(subviews.count, 1))
        let tileSize = resolvedTileSize(width: bounds.width, count: count)
        let totalWidth = tileSize * count + spacing * max(count - 1, 0)
        var x = bounds.midX - totalWidth / 2

        for subview in subviews {
            subview.place(
                at: CGPoint(x: x, y: bounds.midY - tileSize / 2),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: tileSize, height: tileSize)
            )
            x += tileSize + spacing
        }
    }

    private func resolvedTileSize(width: CGFloat, count: CGFloat) -> CGFloat {
        let availableWidth = max(0, width - spacing * max(count - 1, 0))
        return max(0, min(maxTileSize, floor(availableWidth / count)))
    }
}

struct HuddleParticipantTile: View {
    let isActive: Bool
    let isMuted: Bool
    let isSpeaking: Bool
    let label: String
    let member: SlackWorkspaceMember?
    var showsActivity = false
    let style: HuddleParticipantStyle

    var body: some View {
        ZStack {
            avatar
                .padding(32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(tileBackground, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(alignment: .bottomLeading) {
            participantBadge
                .padding(12)
        }
        .overlay {
            participantBorder
        }
        .opacity(isActive ? 1 : 0.72)
    }

    @ViewBuilder
    private var avatar: some View {
        switch style {
            case .appIcon:
                Image("AppIconImage")
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .shadow(color: .black.opacity(0.32), radius: 18, y: 10)
            case .person:
                if let member {
                    AsyncImage(url: member.avatarURL) { phase in
                        switch phase {
                            case let .success(image):
                                image
                                    .resizable()
                                    .scaledToFill()
                            case .empty:
                                personFallback
                                    .overlay {
                                        ProgressView()
                                            .tint(.white)
                                    }
                            case .failure:
                                personFallback
                            @unknown default:
                                personFallback
                        }
                    }
                    .clipShape(Circle())
                } else {
                    personFallback
                }
        }
    }

    private var personFallback: some View {
        ZStack {
            Circle()
                .fill(Color(red: 0.38, green: 0.74, blue: 0.88))
            Image(systemName: "person.fill")
                .font(.system(size: 78, weight: .bold))
                .foregroundStyle(Color(red: 0.88, green: 0.96, blue: 1.0))
        }
    }

    private var participantBadge: some View {
        HStack(spacing: 7) {
            if showsActivity {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.72)
            } else {
                Image(systemName: isMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.caption.weight(.bold))
            }
            Text(label)
                .font(.subheadline.weight(.bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(.black.opacity(0.50), in: Capsule())
    }

    private var participantBorder: some View {
        ZStack {
            if isSpeaking {
                speakingBorder
            } else {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(idleBorderColor, lineWidth: 1)
            }
        }
        .animation(.snappy(duration: 0.16), value: isSpeaking)
    }

    /// Pulsing rings shown only while speaking. Driven by `PhaseAnimator`,
    /// which stops deterministically when the view is removed — unlike
    /// `repeatForever`, which can keep pulsing after `isSpeaking` turns false.
    private var speakingBorder: some View {
        PhaseAnimator([false, true]) { isPulsed in
            ZStack {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(
                        .white.opacity(isPulsed ? 0.42 : 0.98),
                        lineWidth: isPulsed ? 2.2 : 4
                    )
                    .shadow(
                        color: .white.opacity(isPulsed ? 0.16 : 0.38),
                        radius: isPulsed ? 7 : 2
                    )

                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(.white.opacity(0.50), lineWidth: 2)
                    .scaleEffect(isPulsed ? 1.06 : 1.0)
                    .opacity(isPulsed ? 0.10 : 0.50)
            }
        } animation: { _ in
            .easeInOut(duration: 0.58)
        }
    }

    private var idleBorderColor: Color {
        isActive ? .white.opacity(0.22) : .white.opacity(0.09)
    }

    private var tileBackground: some ShapeStyle {
        LinearGradient(
            colors: style == .appIcon
                ? [.black.opacity(0.18), .black.opacity(0.42)]
                : [Color(red: 0.90, green: 0.96, blue: 1.0), Color(red: 0.71, green: 0.88, blue: 0.94)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
