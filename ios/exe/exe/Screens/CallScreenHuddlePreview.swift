import ExeDomain
import ExeUI
import SwiftUI

#if DEBUG
enum CallScreenHuddlePreviewVariant {
    case active
    case documentOpen
    case lobby
    case mutedWaiting

    var isAgentConnected: Bool {
        switch self {
            case .active, .documentOpen:
                true
            case .lobby, .mutedWaiting:
                false
        }
    }

    var isPushToTalkActive: Bool {
        switch self {
            case .active:
                true
            case .documentOpen, .lobby, .mutedWaiting:
                false
        }
    }

    var showsDocument: Bool {
        switch self {
            case .documentOpen:
                true
            case .active, .lobby, .mutedWaiting:
                false
        }
    }

    var showsJoinAction: Bool {
        switch self {
            case .lobby:
                true
            case .active, .documentOpen, .mutedWaiting:
                false
        }
    }
}

struct CallScreenHuddlePreviewSurface: View {
    let fixture = MeetingDocumentPanelPreviewData.fixture
    let variant: CallScreenHuddlePreviewVariant
    @Namespace
    var huddleControlsGlassNamespace
    @State
    var isMeetingDocumentOpen: Bool
    @State
    var isMeetingDocumentPresented: Bool
    @State
    var isPushToTalkActive: Bool
    @State
    var isPushToTalkEnabled = true
    @State
    var isMuted: Bool

    init(_ variant: CallScreenHuddlePreviewVariant) {
        self.variant = variant
        _isMeetingDocumentOpen = State(initialValue: variant.showsDocument)
        _isMeetingDocumentPresented = State(initialValue: variant.showsDocument)
        _isPushToTalkActive = State(initialValue: variant.isPushToTalkActive)
        _isMuted = State(initialValue: !variant.isPushToTalkActive)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            HuddleBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                huddleHeader
                    .padding(.horizontal, 18)
                    .padding(.top, 10)

                Spacer(minLength: 18)

                participantStage
                    .padding(.horizontal, 22)

                Spacer(minLength: 18)

                if variant.showsJoinAction {
                    joinCallButton
                        .padding(.horizontal, 22)
                        .padding(.bottom, 14)
                }

                huddleControls
                    .padding(.horizontal, 22)
                    .padding(.bottom, isMeetingDocumentOpen ? 14 : 24)
            }

            meetingDocumentOverlay
        }
        .animation(.snappy(duration: 0.22), value: isMeetingDocumentOpen)
    }
}

#Preview("Huddle Full Screen") {
    CallScreenHuddlePreviewSurface(.active)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Huddle Document Open") {
    CallScreenHuddlePreviewSurface(.documentOpen)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Huddle Lobby") {
    CallScreenHuddlePreviewSurface(.lobby)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Huddle Muted Waiting") {
    CallScreenHuddlePreviewSurface(.mutedWaiting)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Huddle Narrow Document") {
    CallScreenHuddlePreviewSurface(.documentOpen)
        .frame(width: 390, height: 844)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
