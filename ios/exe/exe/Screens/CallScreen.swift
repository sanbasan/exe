import ExeDomain
import ExeLiveKit
import ExeUI
import SwiftUI

struct CallScreen: View {
    @Environment(AppComposition.self)
    var composition
    @Environment(AppRouter.self)
    var router
    @Namespace
    var huddleControlsGlassNamespace
    @AppStorage("call.pushToTalkEnabled")
    var isPushToTalkEnabled = true
    @State
    var didRequestAgentSafetyNet = false
    @State
    var errorMessage: String?
    @State
    var isMeetingDocumentOpen = false
    @State
    var isMeetingDocumentPresented = false
    @State
    var isPressingPushToTalk = false
    @State
    var liveKitManager = LiveKitSessionManager()
    @State
    var members: [SlackWorkspaceMember] = []
    @State
    var phase: Phase = .loading
    @State
    var session: CallSession?

    let workspaceId: WorkspaceID
    let callSessionId: String
    let callKitManager: CallKitManager?

    enum Phase {
        case active
        case connecting
        case ended
        case error
        case loading
        case lobby
    }

    var body: some View {
        content
            .overlay(alignment: .top) {
                if let errorMessage, phase != .ended, phase != .error {
                    InlineErrorView(errorMessage)
                        .padding(.horizontal, 18)
                        .padding(.top, 76)
                }
            }
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
            .task(id: callSessionId) { await load() }
            .onDisappear {
                guard phase == .active || phase == .connecting else { return }
                Swift.Task { await liveKitManager.disconnect() }
            }
    }

    @ViewBuilder
    var content: some View {
        switch phase {
            case .active:
                activeContent
            case .connecting:
                connectingContent
            case .ended:
                endedContent
            case .error:
                VStack(spacing: 16) {
                    if let errorMessage {
                        InlineErrorView(errorMessage)
                    }
                    EmptyStateView("Call unavailable", systemImage: "phone.down", message: "Open the call again later.")
                }
                .padding(20)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ExeColors.background.ignoresSafeArea())
            case .loading:
                loadingContent
            case .lobby:
                lobbyContent
        }
    }
}
