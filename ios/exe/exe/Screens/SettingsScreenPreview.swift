import SwiftUI

#if DEBUG
#Preview("Settings Admin") {
    SettingsPreviewStack {
        SettingsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.settingsAdminState
        )
    }
}

#Preview("Settings Member") {
    SettingsPreviewStack {
        SettingsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.settingsMemberState
        )
    }
}

#Preview("Settings Workspace Switch Alert") {
    SettingsPreviewStack {
        SettingsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.settingsAdminState,
            showsWorkspaceSwitchConfirmation: true
        )
    }
}
#endif
