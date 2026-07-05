import SwiftUI

#if DEBUG
extension CallScreenHuddlePreviewSurface {
    var huddleControls: some View {
        Group {
            if #available(iOS 26.0, *) {
                morphingHuddleControls
            } else {
                fallbackHuddleControls
            }
        }
        .frame(maxWidth: 366)
        .frame(maxWidth: .infinity)
    }

    @available(iOS 26.0, *)
    private var morphingHuddleControls: some View {
        GlassEffectContainer(spacing: 18) {
            HStack(spacing: 16) {
                if isPushToTalkEnabled {
                    pushToTalkControl(usesGlassBackground: false, showsIdleStroke: false)
                        .glassEffect(
                            .regular
                                .tint(huddlePrimaryControlGlassTint)
                                .interactive(!variant.showsJoinAction),
                            in: Capsule()
                        )
                        .glassEffectID("huddle-push-to-talk", in: huddleControlsGlassNamespace)
                } else {
                    muteControl(usesChrome: false)
                        .glassEffect(
                            .regular
                                .tint(huddleIconControlGlassTint)
                                .interactive(!variant.showsJoinAction),
                            in: Circle()
                        )
                        .glassEffectID("huddle-mute", in: huddleControlsGlassNamespace)
                }

                documentControl(usesChrome: false)
                    .glassEffect(.regular.tint(huddleIconControlGlassTint).interactive(), in: Circle())
                    .glassEffectID("huddle-document", in: huddleControlsGlassNamespace)
            }
        }
    }

    private var huddlePrimaryControlGlassTint: Color {
        if isPushToTalkActive {
            return Color(red: 0.36, green: 0.52, blue: 0.62).opacity(0.48)
        }

        return Color(red: 0.04, green: 0.08, blue: 0.08).opacity(0.58)
    }

    private var huddleIconControlGlassTint: Color {
        Color(red: 0.04, green: 0.08, blue: 0.08).opacity(0.54)
    }

    private var fallbackHuddleControls: some View {
        HStack(spacing: 16) {
            if isPushToTalkEnabled {
                pushToTalkControl(usesGlassBackground: true, showsIdleStroke: true)
            } else {
                muteControl(usesChrome: true)
            }
            documentControl(usesChrome: true)
        }
    }

    private func pushToTalkControl(usesGlassBackground: Bool, showsIdleStroke: Bool) -> some View {
        PushToTalkButton(
            isActive: isPushToTalkActive,
            isEnabled: isPushToTalkEnabled && !variant.showsJoinAction,
            usesGlassBackground: usesGlassBackground,
            showsIdleStroke: showsIdleStroke
        )
        .contentShape(Capsule())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard isPushToTalkEnabled, !variant.showsJoinAction else { return }
                    isPushToTalkActive = true
                    isMuted = false
                }
                .onEnded { _ in
                    isPushToTalkActive = false
                    isMuted = true
                }
        )
    }

    private func muteControl(usesChrome: Bool) -> some View {
        Button {
            guard !variant.showsJoinAction else { return }
            isMuted.toggle()
        } label: {
            HuddleControlIcon(
                systemName: isMuted ? "mic.slash.fill" : "mic.fill",
                usesChrome: usesChrome
            )
        }
        .buttonStyle(.plain)
        .contentShape(Circle())
        .disabled(variant.showsJoinAction)
        .opacity(variant.showsJoinAction ? 0.56 : 1)
    }

    private func documentControl(usesChrome: Bool) -> some View {
        Button {
            toggleMeetingDocument()
        } label: {
            HuddleControlIcon(
                systemName: isMeetingDocumentOpen ? "doc.text.fill" : "doc.text",
                usesChrome: usesChrome
            )
        }
        .buttonStyle(.plain)
        .contentShape(Circle())
    }

    var pushToTalkModeBinding: Binding<Bool> {
        Binding(
            get: { isPushToTalkEnabled },
            set: { setPushToTalkEnabled($0) }
        )
    }

    private func setPushToTalkEnabled(_ isEnabled: Bool) {
        isPushToTalkEnabled = isEnabled
        isPushToTalkActive = false
        isMuted = true
    }

    private func toggleMeetingDocument() {
        if isMeetingDocumentOpen {
            closeMeetingDocument()
        } else {
            openMeetingDocument()
        }
    }

    private func closeMeetingDocument() {
        withAnimation(.snappy(duration: 0.24)) {
            isMeetingDocumentOpen = false
        }

        Swift.Task { @MainActor in
            try? await Swift.Task.sleep(for: .milliseconds(260))
            guard !isMeetingDocumentOpen else { return }
            isMeetingDocumentPresented = false
        }
    }

    private func openMeetingDocument() {
        isMeetingDocumentPresented = true
        Swift.Task { @MainActor in
            await Swift.Task.yield()
            withAnimation(.snappy(duration: 0.24)) {
                isMeetingDocumentOpen = true
            }
        }
    }
}
#endif
