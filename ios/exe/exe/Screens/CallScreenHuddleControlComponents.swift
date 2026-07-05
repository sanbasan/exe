import ExeUI
import SwiftUI

struct PushToTalkButton: View {
    let isActive: Bool
    let isEnabled: Bool
    var usesGlassBackground = true
    var showsIdleStroke = true

    var body: some View {
        if usesGlassBackground {
            decorated(buttonContent.exeGlassBackground(shape: .capsule, isInteractive: isEnabled))
        } else {
            decorated(buttonContent)
        }
    }

    private var buttonContent: some View {
        HStack(spacing: 12) {
            Image(systemName: isActive ? "waveform" : "mic.fill")
                .font(.title2.weight(.bold))
                .frame(width: 28)

            Text(title)
                .font(.headline.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
        .foregroundStyle(foregroundColor)
        .padding(.horizontal, 22)
        .frame(maxWidth: .infinity)
        .frame(height: 58)
    }

    private func decorated(_ content: some View) -> some View {
        content
            .overlay {
                if showsIdleStroke, !isActive {
                    Capsule()
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                        .allowsHitTesting(false)
                }
            }
            .shadow(
                color: .black.opacity(isActive ? 0.24 : 0.18),
                radius: isActive ? 14 : 10,
                y: isActive ? 8 : 6
            )
            .opacity(isEnabled ? 1 : 0.56)
            .animation(.snappy(duration: 0.18), value: isActive)
            .animation(.snappy(duration: 0.18), value: isEnabled)
    }

    private var title: String {
        if !isEnabled {
            return String(localized: "Connecting")
        }

        return isActive ? String(localized: "Speaking") : String(localized: "Push to talk")
    }

    private var foregroundColor: Color {
        isEnabled ? .white : .white.opacity(0.70)
    }
}

struct HuddleControlIcon: View {
    var systemName: String
    var background: Color = .black.opacity(0.46)
    var foreground: Color = .white
    var badge = false
    var usesChrome = true

    var body: some View {
        Image(systemName: systemName)
            .font(.title3.weight(.bold))
            .foregroundStyle(foreground)
            .frame(width: 58, height: 58)
            .background {
                if usesChrome {
                    Circle().fill(background)
                }
            }
            .overlay {
                if usesChrome {
                    Circle().stroke(.white.opacity(0.12), lineWidth: 1)
                }
            }
            .overlay(alignment: .topTrailing) {
                if badge {
                    Circle()
                        .fill(Color(red: 0.93, green: 0.18, blue: 0.45))
                        .frame(width: 13, height: 13)
                        .offset(x: -7, y: 7)
                }
            }
    }
}
