import SwiftUI

struct HuddleBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.02, green: 0.04, blue: 0.04),
                    Color(red: 0.06, green: 0.12, blue: 0.12),
                    Color(red: 0.02, green: 0.03, blue: 0.04)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color(red: 0.55, green: 0.22, blue: 0.18).opacity(0.34))
                .blur(radius: 34)
                .frame(width: 420, height: 120)
                .rotationEffect(.degrees(9))
                .offset(x: -70, y: -130)

            Circle()
                .fill(Color(red: 0.03, green: 0.42, blue: 0.34).opacity(0.22))
                .blur(radius: 48)
                .frame(width: 360, height: 260)
                .offset(x: 120, y: 250)

            HuddleStarField()
                .opacity(0.72)
        }
    }
}

private struct HuddleStar: Identifiable {
    let id = UUID()
    let x: Double
    let y: Double
    let size: Double
    let opacity: Double
}

private struct HuddleStarField: View {
    private let stars: [HuddleStar] = [
        HuddleStar(x: 0.08, y: 0.16, size: 6, opacity: 0.42),
        HuddleStar(x: 0.22, y: 0.11, size: 4, opacity: 0.34),
        HuddleStar(x: 0.36, y: 0.19, size: 3, opacity: 0.50),
        HuddleStar(x: 0.72, y: 0.14, size: 5, opacity: 0.42),
        HuddleStar(x: 0.88, y: 0.20, size: 4, opacity: 0.36),
        HuddleStar(x: 0.12, y: 0.36, size: 3, opacity: 0.35),
        HuddleStar(x: 0.28, y: 0.42, size: 5, opacity: 0.28),
        HuddleStar(x: 0.58, y: 0.34, size: 4, opacity: 0.44),
        HuddleStar(x: 0.78, y: 0.47, size: 7, opacity: 0.30),
        HuddleStar(x: 0.94, y: 0.39, size: 3, opacity: 0.38),
        HuddleStar(x: 0.16, y: 0.62, size: 4, opacity: 0.44),
        HuddleStar(x: 0.40, y: 0.56, size: 3, opacity: 0.30),
        HuddleStar(x: 0.62, y: 0.66, size: 5, opacity: 0.36),
        HuddleStar(x: 0.86, y: 0.72, size: 3, opacity: 0.50),
        HuddleStar(x: 0.21, y: 0.84, size: 7, opacity: 0.28),
        HuddleStar(x: 0.51, y: 0.88, size: 3, opacity: 0.38),
        HuddleStar(x: 0.75, y: 0.91, size: 5, opacity: 0.32),
        HuddleStar(x: 0.06, y: 0.77, size: 3, opacity: 0.40),
        HuddleStar(x: 0.96, y: 0.58, size: 4, opacity: 0.30)
    ]

    var body: some View {
        GeometryReader { proxy in
            ForEach(stars) { star in
                Circle()
                    .fill(Color.white.opacity(star.opacity))
                    .frame(width: star.size, height: star.size)
                    .position(x: proxy.size.width * star.x, y: proxy.size.height * star.y)
            }
        }
    }
}
