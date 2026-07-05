import ExeUI
import SwiftUI

#if DEBUG
struct SettingsPreviewStack<Content: View>: View {
    let content: Content
    @State
    private var router = AppRouter()

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        @Bindable
        var router = router

        NavigationStack(path: $router.path) {
            content
                .navigationDestination(for: AppRoute.self) { route in
                    SettingsPreviewDestination(route: route)
                }
        }
        .environment(router)
        .environment(SettingsPreviewData.composition)
        .environment(\.locale, Locale(identifier: "ja_JP"))
        .tint(ExeColors.accent)
    }
}

private struct SettingsPreviewDestination: View {
    let route: AppRoute

    var body: some View {
        switch route {
            case .accountManagement:
                AccountManagementScreen(
                    workspaceId: SettingsPreviewData.workspaceId,
                    previewState: SettingsPreviewData.accountAdminState
                )
            case .channels:
                ChannelsScreen(
                    workspaceId: SettingsPreviewData.workspaceId,
                    previewState: SettingsPreviewData.channelsState
                )
            case .callScheduleSettings:
                CallScheduleSettingsScreen(
                    workspaceId: SettingsPreviewData.workspaceId,
                    previewState: SettingsPreviewData.callScheduleState
                )
            case .settings:
                SettingsScreen(
                    workspaceId: SettingsPreviewData.workspaceId,
                    previewState: SettingsPreviewData.settingsAdminState
                )
            case .workspaceSelect:
                ContentUnavailableView("ワークスペース選択", systemImage: "building.2")
            case .admins, .call, .workspaceHome:
                ContentUnavailableView("Preview 未設定", systemImage: "eye.slash")
        }
    }
}
#endif
