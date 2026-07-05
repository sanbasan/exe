import SwiftUI

public enum ExeGlassShape {
    case capsule
    case circle
    case roundedRectangle(CGFloat)
}

public extension View {
    func exeGlassButton(shape: ExeGlassShape, isInteractive: Bool = true) -> some View {
        foregroundStyle(.primary)
            .tint(.primary)
            .buttonStyle(.plain)
            .exeGlassBackground(shape: shape, isInteractive: isInteractive)
    }

    @ViewBuilder
    func exeGlassBackground(shape: ExeGlassShape, isInteractive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            switch shape {
                case .capsule:
                    glassEffect(.regular.interactive(isInteractive), in: Capsule())
                case .circle:
                    glassEffect(.regular.interactive(isInteractive), in: Circle())
                case let .roundedRectangle(cornerRadius):
                    glassEffect(
                        .regular.interactive(isInteractive),
                        in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    )
            }
        } else {
            exeGlassFallbackBackground(shape: shape)
        }
    }

    @ViewBuilder
    private func exeGlassFallbackBackground(shape: ExeGlassShape) -> some View {
        switch shape {
            case .capsule:
                background(.ultraThinMaterial, in: Capsule())
            case .circle:
                background(.ultraThinMaterial, in: Circle())
            case let .roundedRectangle(cornerRadius):
                background(
                    .ultraThinMaterial,
                    in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                )
        }
    }
}
