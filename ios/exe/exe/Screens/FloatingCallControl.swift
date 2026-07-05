import ExeAPIClient
import ExeUI
import SwiftUI

/// Floating liquid-glass call control.
///
/// Tapping the pill does NOT start a call immediately. Instead the single glass
/// pill expands ("ウニョっと") into a small in-place menu of call options. The
/// menu is not a standard alert/confirmationDialog, and every glass element is
/// pressable.
struct FloatingCallControl: View {
    let isScheduledDefault: Bool
    let isStarting: Bool
    let onStart: (ManualReviewCallMode) -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            MorphingCallControl(
                isScheduledDefault: isScheduledDefault,
                isStarting: isStarting,
                onStart: onStart
            )
        } else {
            FallbackCallControl(
                isScheduledDefault: isScheduledDefault,
                isStarting: isStarting,
                onStart: onStart
            )
        }
    }
}

private enum CallControlLayout {
    static let buttonHeight: CGFloat = 64
    static let menuWidth: CGFloat = 268
}

private struct CallOption: Identifiable {
    let mode: ManualReviewCallMode
    let systemImage: String
    let title: LocalizedStringKey

    var id: String {
        mode.rawValue
    }
}

private func callOptions(isScheduledDefault: Bool) -> [CallOption] {
    var options = [
        CallOption(
            mode: .auto,
            systemImage: "phone.fill",
            title: isScheduledDefault ? "Start scheduled review" : "Start task review"
        )
    ]
    if isScheduledDefault {
        options.append(
            CallOption(
                mode: .manualReview,
                systemImage: "phone.badge.plus",
                title: "Additional manual review"
            )
        )
    }
    return options
}

@available(iOS 26.0, *)
private struct MorphingCallControl: View {
    let isScheduledDefault: Bool
    let isStarting: Bool
    let onStart: (ManualReviewCallMode) -> Void

    @Namespace
    private var glassNamespace
    @State
    private var isExpanded = false

    private var options: [CallOption] {
        callOptions(isScheduledDefault: isScheduledDefault)
    }

    var body: some View {
        GlassEffectContainer(spacing: 10) {
            VStack(alignment: .trailing, spacing: 14) {
                if isExpanded {
                    ForEach(options) { option in
                        optionPill(option)
                    }
                }

                triggerPill
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var triggerPill: some View {
        Button {
            withAnimation(.bouncy(duration: 0.42)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 10) {
                if isStarting {
                    ProgressView()
                } else {
                    Image(systemName: isExpanded ? "xmark" : "phone.fill")
                        .font(.headline.weight(.semibold))
                        .contentTransition(.symbolEffect(.replace))
                }

                if !isExpanded {
                    Text("Call")
                        .font(.headline.weight(.semibold))
                }
            }
            .foregroundStyle(isExpanded ? Color.primary : Color.white)
            .frame(
                width: isExpanded ? CallControlLayout.buttonHeight : 128,
                height: CallControlLayout.buttonHeight
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .glassEffect(
            isExpanded ? .regular.interactive() : .regular.tint(ExeColors.accent).interactive(),
            in: Capsule()
        )
        .glassEffectID("call-trigger", in: glassNamespace)
        .disabled(isStarting)
        .accessibilityLabel(isExpanded ? "Close call menu" : "Open call menu")
    }

    private func optionPill(_ option: CallOption) -> some View {
        Button {
            withAnimation(.bouncy(duration: 0.32)) {
                isExpanded = false
            }
            onStart(option.mode)
        } label: {
            Label(option.title, systemImage: option.systemImage)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .frame(width: CallControlLayout.menuWidth, height: 54)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .glassEffect(.regular.interactive(), in: Capsule())
        .glassEffectID(option.id, in: glassNamespace)
        .disabled(isStarting)
        .transition(.scale(scale: 0.94, anchor: .bottomTrailing).combined(with: .opacity))
    }
}

/// Pre-iOS-26 fallback: keeps the "tap morphs into a menu" interaction using
/// material backgrounds and a spring expansion instead of true glass morphing.
private struct FallbackCallControl: View {
    let isScheduledDefault: Bool
    let isStarting: Bool
    let onStart: (ManualReviewCallMode) -> Void

    @State
    private var isExpanded = false

    private var options: [CallOption] {
        callOptions(isScheduledDefault: isScheduledDefault)
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 12) {
            if isExpanded {
                ForEach(options) { option in
                    optionPill(option)
                }
            }

            triggerPill
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var triggerPill: some View {
        Button {
            withAnimation(.snappy(duration: 0.28)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 10) {
                if isStarting {
                    ProgressView()
                } else {
                    Image(systemName: isExpanded ? "xmark" : "phone.fill")
                        .font(.headline.weight(.semibold))
                }

                if !isExpanded {
                    Text("Call")
                        .font(.headline.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
            .frame(
                width: isExpanded ? CallControlLayout.buttonHeight : 128,
                height: CallControlLayout.buttonHeight
            )
            .background(ExeColors.accent, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .shadow(color: .black.opacity(0.18), radius: 16, x: 0, y: 8)
        .disabled(isStarting)
    }

    private func optionPill(_ option: CallOption) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.24)) {
                isExpanded = false
            }
            onStart(option.mode)
        } label: {
            Label(option.title, systemImage: option.systemImage)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .frame(width: CallControlLayout.menuWidth, height: 54)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .background(.ultraThinMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
        .disabled(isStarting)
        .transition(.scale(scale: 0.9, anchor: .bottomTrailing).combined(with: .opacity))
    }
}
