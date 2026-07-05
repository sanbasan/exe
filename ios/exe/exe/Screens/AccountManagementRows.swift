import ExeDomain
import ExeUI
import SwiftUI

struct MemberAvatarView: View {
    let member: SlackWorkspaceMember
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let avatarURL = member.avatarURL {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                        case let .success(image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .empty:
                            ProgressView()
                        case .failure:
                            fallback
                        @unknown default:
                            fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            Circle().stroke(.quaternary, lineWidth: 1)
        }
    }

    private var fallback: some View {
        Text(String(member.displayName.prefix(1)).uppercased())
            .font(fallbackFont)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ExeColors.accentSoft)
    }

    private var fallbackFont: Font {
        size < 28 ? .caption.weight(.bold) : .subheadline.weight(.bold)
    }
}

extension SlackWorkspaceMember {
    var searchText: String {
        [
            Optional(displayName),
            email,
            slackId,
            name,
            real_name
        ]
        .compactMap { $0?.lowercased() }
        .joined(separator: " ")
    }
}
