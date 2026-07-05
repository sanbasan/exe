import SwiftUI

#if DEBUG
#Preview("Call Schedule Settings") {
    SettingsPreviewStack {
        CallScheduleSettingsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.callScheduleState
        )
    }
}
#endif
