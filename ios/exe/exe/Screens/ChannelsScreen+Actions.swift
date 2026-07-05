import ExeAPIClient
import ExeDomain
import Foundation

extension ChannelsScreen {
    func load() async {
        do {
            async let loadedChannels = composition.channelRepository.listChannels(workspaceId: workspaceId)
            async let loadedProfile = composition.workspaceRepository.getMe()
            async let loadedWorkspaces = composition.workspaceRepository.listWorkspaces()
            let (channels, userProfile, workspaces) = try await (
                loadedChannels,
                loadedProfile,
                loadedWorkspaces
            )
            let watchedIds = Self.watchedChannelIds(
                channels: channels,
                userProfile: userProfile,
                workspaceId: workspaceId
            )

            self.channels = channels
            self.userProfile = userProfile
            workspace = workspaces.first { $0.id == workspaceId }
            originalWatchedChannelIds = watchedIds
            selectedWatchedChannelIds = watchedIds
            saveMessage = nil
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveWatchSettings() {
        isSavingWatchSettings = true
        saveMessage = nil
        errorMessage = nil
        Swift.Task {
            defer { isSavingWatchSettings = false }
            do {
                _ = try await composition.channelRepository.putWatchedChannels(
                    workspaceId: workspaceId,
                    channelIds: Array(selectedWatchedChannelIds).sorted()
                )
                originalWatchedChannelIds = selectedWatchedChannelIds
                saveMessage = String(localized: "Saved")
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func submitMetadata(
        channel: Channel,
        input: PatchChannelInput
    ) async {
        isSavingChannelId = channel.id
        defer { isSavingChannelId = nil }
        do {
            _ = try await composition.channelRepository.patchChannel(
                workspaceId: workspaceId,
                channelId: channel.channelId,
                input: input
            )
            channelLatestInfoToEdit = nil
            channelToEdit = nil
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateChannel(
        _ channel: Channel,
        input: PatchChannelInput
    ) {
        isSavingChannelId = channel.id
        errorMessage = nil
        Swift.Task {
            defer { isSavingChannelId = nil }
            do {
                _ = try await composition.channelRepository.patchChannel(
                    workspaceId: workspaceId,
                    channelId: channel.channelId,
                    input: input
                )
                channelToArchive = nil
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    static func watchedChannelIds(
        channels: [Channel],
        userProfile: UserProfile?,
        workspaceId: WorkspaceID
    ) -> Set<SlackChannelID> {
        guard
            let slackUserId = userProfile?.slackUsers.first(where: { $0.workspaceId == workspaceId })?
                .slackUserId
        else {
            return []
        }

        return Set(
            channels
                .filter { $0.watcherSlackUserIds.contains(slackUserId) }
                .map(\.channelId)
        )
    }
}
