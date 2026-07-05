import SwiftUI

#if DEBUG
#Preview("Account Management") {
    SettingsPreviewStack {
        AccountManagementScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.accountAdminState
        )
    }
}

#Preview("Account First Admin") {
    SettingsPreviewStack {
        AccountManagementScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.accountSetupState
        )
    }
}

#Preview("Account Permission Denied") {
    SettingsPreviewStack {
        AccountManagementScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.accountPermissionDeniedState
        )
    }
}
#endif
