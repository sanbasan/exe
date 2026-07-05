import ExeLiveKit
import SwiftUI

extension CallScreen {
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
                                .interactive(isPushToTalkAvailable),
                            in: Capsule()
                        )
                        .glassEffectID("huddle-push-to-talk", in: huddleControlsGlassNamespace)
                } else {
                    muteControl(usesChrome: false)
                        .glassEffect(
                            .regular
                                .tint(huddleIconControlGlassTint)
                                .interactive(isMuteToggleAvailable),
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
        if isPushToTalkButtonActive {
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
            isActive: isPushToTalkButtonActive,
            isEnabled: isPushToTalkAvailable,
            usesGlassBackground: usesGlassBackground,
            showsIdleStroke: showsIdleStroke
        )
        .contentShape(Capsule())
        .gesture(pushToTalkGesture)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(isPushToTalkButtonActive ? "Speaking" : "Push to talk")
    }

    private func muteControl(usesChrome: Bool) -> some View {
        Button {
            toggleMute()
        } label: {
            HuddleControlIcon(
                systemName: liveKitManager.isMuted ? "mic.slash.fill" : "mic.fill",
                usesChrome: usesChrome
            )
        }
        .buttonStyle(.plain)
        .contentShape(Circle())
        .disabled(!isMuteToggleAvailable)
        .opacity(isMuteToggleAvailable ? 1 : 0.56)
        .accessibilityLabel(liveKitManager.isMuted ? "Unmute" : "Mute")
    }

    private func documentControl(usesChrome: Bool) -> some View {
        Button {
            toggleMeetingDocument()
        } label: {
            HuddleControlIcon(
                systemName: isMeetingDocumentOpen ? "doc.text.fill" : "doc.text",
                badge: !hasMeetingDocumentContent,
                usesChrome: usesChrome
            )
        }
        .buttonStyle(.plain)
        .contentShape(Circle())
        .accessibilityLabel(isMeetingDocumentOpen ? "Close today's agenda" : "Open today's agenda")
    }

    var pushToTalkModeBinding: Binding<Bool> {
        Binding(
            get: { isPushToTalkEnabled },
            set: { setPushToTalkEnabled($0) }
        )
    }

    var isPushToTalkAvailable: Bool {
        isPushToTalkEnabled && phase == .active
    }

    var isPushToTalkButtonActive: Bool {
        isPushToTalkEnabled && (isPressingPushToTalk || liveKitManager.isPushToTalkActive)
    }

    private var isMuteToggleAvailable: Bool {
        !isPushToTalkEnabled && phase == .active
    }

    private var pushToTalkGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in beginPushToTalk() }
            .onEnded { _ in endPushToTalk() }
    }

    private var hasMeetingDocumentContent: Bool {
        liveKitManager.agenda != nil || !liveKitManager.proposedPatches.isEmpty || !liveKitManager.proposedDrafts
            .isEmpty || !liveKitManager.proposedWorkTaskDrafts.isEmpty || !liveKitManager.proposedLatestInfoDrafts
            .isEmpty || !liveKitManager.gbrainLookups.isEmpty
    }

    private func beginPushToTalk() {
        guard isPushToTalkAvailable, !isPressingPushToTalk else { return }
        isPressingPushToTalk = true
        Swift.Task {
            try? await liveKitManager.beginPushToTalk()
        }
    }

    private func endPushToTalk() {
        guard isPressingPushToTalk || liveKitManager.isPushToTalkActive else { return }
        isPressingPushToTalk = false
        Swift.Task {
            try? await liveKitManager.endPushToTalk()
        }
    }

    private func toggleMute() {
        guard isMuteToggleAvailable else { return }
        Swift.Task {
            try? await liveKitManager.toggleMute()
        }
    }

    private func setPushToTalkEnabled(_ isEnabled: Bool) {
        guard isPushToTalkEnabled != isEnabled else { return }
        isPushToTalkEnabled = isEnabled
        isPressingPushToTalk = false
        Swift.Task {
            try? await liveKitManager.endPushToTalk()
        }
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
