import ExeAPIClient
import ExeUI
import SwiftUI

struct RootView: View {
    @Environment(AppComposition.self)
    private var composition
    @Environment(AppRouter.self)
    private var router
    @State
    private var authState: AuthState = .loading

    let callKitManager: CallKitManager

    enum AuthState {
        case loading
        case signedIn
        case signedOut
    }

    var body: some View {
        @Bindable
        var router = router

        NavigationStack(path: $router.path) {
            Group {
                switch authState {
                    case .loading:
                        ExeLoadingView()
                    case .signedOut:
                        SignInScreen()
                    case .signedIn:
                        WorkspaceGateScreen()
                }
            }
            .navigationDestination(for: AppRoute.self) { route in
                destination(for: route)
                    .toolbar(.visible, for: .navigationBar)
            }
        }
        .task { observeAuthState() }
    }

    @ViewBuilder
    private func destination(for route: AppRoute) -> some View {
        switch route {
            case let .accountManagement(workspaceId):
                AccountManagementScreen(workspaceId: workspaceId)
            case let .admins(workspaceId):
                AdminsScreen(workspaceId: workspaceId)
            case let .call(workspaceId, callSessionId):
                CallScreen(
                    workspaceId: workspaceId,
                    callSessionId: callSessionId,
                    callKitManager: callKitManager
                )
            case let .channels(workspaceId):
                ChannelsScreen(workspaceId: workspaceId)
            case let .callScheduleSettings(workspaceId):
                CallScheduleSettingsScreen(workspaceId: workspaceId)
            case let .settings(workspaceId):
                SettingsScreen(workspaceId: workspaceId)
            case let .workspaceHome(workspaceId):
                WorkspaceHomeScreen(workspaceId: workspaceId)
            case .workspaceSelect:
                WorkspaceGateScreen()
        }
    }

    private func observeAuthState() {
        composition.authService.addAuthStateListener { isSignedIn in
            Swift.Task { @MainActor in
                authState = isSignedIn ? .signedIn : .signedOut
                if isSignedIn {
                    router.flushPendingRoute()
                }
            }
        }
    }
}
