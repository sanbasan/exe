import SwiftUI

#if DEBUG
#Preview("Channels Admin") {
    SettingsPreviewStack {
        ChannelsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.channelsState
        )
    }
}

#Preview("Channels Member") {
    SettingsPreviewStack {
        ChannelsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.channelsMemberState
        )
    }
}

#Preview("Channels Empty") {
    SettingsPreviewStack {
        ChannelsScreen(
            workspaceId: SettingsPreviewData.workspaceId,
            previewState: SettingsPreviewData.channelsEmptyState
        )
    }
}
#endif
