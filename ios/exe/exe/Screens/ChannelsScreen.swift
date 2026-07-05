import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct ChannelsScreen: View {
    @Environment(AppComposition.self)
    var composition
    @State
    var channelLatestInfoToEdit: Channel?
    @State
    var channelToArchive: ChannelActionTarget?
    @State
    var channelToEdit: Channel?
    @State
    var channels: [Channel]?
    @State
    var errorMessage: String?
    @State
    var isSavingChannelId: SlackChannelID?
    @State
    var isSavingWatchSettings = false
    @State
    var originalWatchedChannelIds: Set<SlackChannelID> = []
    @State
    var query = ""
    @State
    var saveMessage: String?
    @State
    var selectedWatchedChannelIds: Set<SlackChannelID> = []
    @State
    var userProfile: UserProfile?
    @State
    var workspace: Workspace?

    let loadsOnAppear: Bool
    let workspaceId: WorkspaceID

    init(workspaceId: WorkspaceID) {
        self.workspaceId = workspaceId
        loadsOnAppear = true
    }

    #if DEBUG
    init(
        workspaceId: WorkspaceID,
        previewState: ChannelsScreenPreviewState
    ) {
        let watchedIds = Self.watchedChannelIds(
            channels: previewState.channels ?? [],
            userProfile: previewState.userProfile,
            workspaceId: workspaceId
        )
        self.workspaceId = workspaceId
        loadsOnAppear = false
        _channels = State(initialValue: previewState.channels)
        _errorMessage = State(initialValue: previewState.errorMessage)
        _originalWatchedChannelIds = State(initialValue: watchedIds)
        _selectedWatchedChannelIds = State(initialValue: watchedIds)
        _userProfile = State(initialValue: previewState.userProfile)
        _workspace = State(initialValue: previewState.workspace)
    }
    #endif

    var body: some View {
        SettingsListContent(bottomPadding: 36) {
            content
            statusSection
        }
        .navigationTitle("Channels to review")
        .refreshable { await load() }
        .searchable(text: $query, prompt: "Search channels")
        .task(id: workspaceId) {
            if loadsOnAppear {
                await load()
            }
        }
        .toolbar {
            if hasWatchChanges {
                Button("Save") { saveWatchSettings() }
                    .disabled(isSavingWatchSettings)
            }
        }
        .sheet(item: $channelToEdit) { channel in
            EditChannelAssigneesSheet(channel: channel, workspaceId: workspaceId) { input in
                await submitMetadata(channel: channel, input: input)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $channelLatestInfoToEdit) { channel in
            EditChannelLatestInfoSheet(channel: channel) { latestInfo in
                await submitMetadata(
                    channel: channel,
                    input: PatchChannelInput(latestInfo: latestInfo)
                )
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $channelToArchive) { target in
            ChannelArchiveSheet(
                isSaving: isSavingChannelId == target.id,
                onArchive: {
                    updateChannel(
                        target.channel,
                        input: PatchChannelInput(status: .archived)
                    )
                },
                target: target
            )
            .presentationDetents([.height(260), .medium])
            .presentationDragIndicator(.visible)
        }
    }
}

#if DEBUG
struct ChannelsScreenPreviewState {
    var channels: [Channel]?
    var errorMessage: String?
    var userProfile: UserProfile?
    var workspace: Workspace?
}
#endif
