import ExeAPIClient
import ExeDomain
import Foundation
import SwiftUI

extension WorkspaceHomeScreen {
    func load() async {
        do {
            let loadedData = try await loadHomeData()
            snapshot = try loadedData.snapshot(for: workspaceId)
            errorMessage = nil
            members = await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadHomeData() async throws -> WorkspaceHomeLoadedData {
        async let workspaces = composition.workspaceRepository.listWorkspaces()
        async let workTasks = composition.taskRepository.listWorkTasks(workspaceId: workspaceId)
        async let followUps = composition.taskRepository.listFollowUpTasks(workspaceId: workspaceId)
        async let requestedWorkTasks = loadRequestedWorkTasks()
        async let assignedChannels = composition.channelRepository.listAssignedChannels(workspaceId: workspaceId)
        async let watchedChannels = composition.channelRepository.listWatchedChannels(workspaceId: workspaceId)
        async let channels = composition.channelRepository.listChannels(workspaceId: workspaceId)
        async let channelBlocks = composition.channelRepository.listBlocks(workspaceId: workspaceId)
        async let reviewStates = composition.channelRepository.listChannelReviewStates(workspaceId: workspaceId)
        async let schedule = composition.callRepository.getSchedule(workspaceId: workspaceId)

        return try await WorkspaceHomeLoadedData(
            workspaces: workspaces,
            workTasks: workTasks,
            followUpTasks: followUps,
            requestedWorkTasks: requestedWorkTasks,
            assignedChannels: assignedChannels,
            watchedChannels: watchedChannels,
            channels: channels,
            channelBlocks: channelBlocks,
            reviewStates: reviewStates,
            schedule: schedule
        )
    }

    func loadRequestedWorkTasks() async throws -> [WorkTask] {
        do {
            return try await composition.taskRepository.listRequestedWorkTasks(workspaceId: workspaceId)
        } catch APIError.badRequest {
            return []
        } catch {
            throw error
        }
    }

    func loadMembers() async -> [SlackWorkspaceMember] {
        do {
            return try await composition.workspaceRepository.listSlackMembers(workspaceId: workspaceId)
        } catch {
            // メンバー一覧の取得に失敗した場合は、既存の選択チップだけ表示し、
            // 候補検索なし（autocomplete なし）にフォールバックする。
            return []
        }
    }

    func startManualCall(mode: ManualReviewCallMode) {
        isStartingCall = true
        errorMessage = nil
        Swift.Task {
            defer { isStartingCall = false }
            do {
                let result = try await composition.callRepository.startManualReviewCall(
                    workspaceId: workspaceId,
                    mode: mode
                )
                router.navigate(to: .call(workspaceId: workspaceId, callSessionId: result.session.id))
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func submitTaskPatch(_ patch: TaskPatch) async {
        isSavingTaskId = patch.taskId
        defer { isSavingTaskId = nil }
        do {
            _ = try await composition.taskRepository.patchTask(
                workspaceId: workspaceId,
                patch: patch
            )
            editingTask = nil
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateStatus(for target: TaskActionTarget, status: TaskStatus) {
        isSavingTaskId = target.id
        errorMessage = nil
        Swift.Task {
            defer { isSavingTaskId = nil }
            do {
                let patch = TaskPatch.status(task: target.task, status: status)
                _ = try await composition.taskRepository.patchTask(
                    workspaceId: workspaceId,
                    patch: patch
                )
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func submitChannelMetadata(
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
            channelToEdit = nil
            channelLatestInfoToEdit = nil
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

    func updateBlock(_ block: ChannelBlock, title: String, description: String?) async {
        isSavingBlockId = block.id
        defer { isSavingBlockId = nil }
        do {
            _ = try await composition.channelRepository.updateBlock(
                workspaceId: workspaceId,
                blockId: block.id,
                input: UpdateChannelBlockInput(
                    title: title,
                    description: description ?? title
                )
            )
            blockToEdit = nil
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteBlock(_ block: ChannelBlock) {
        isSavingBlockId = block.id
        errorMessage = nil
        Swift.Task {
            defer { isSavingBlockId = nil }
            do {
                _ = try await composition.channelRepository.deleteBlock(
                    workspaceId: workspaceId,
                    blockId: block.id
                )
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func resolveBlock(_ block: ChannelBlock) {
        isSavingBlockId = block.id
        errorMessage = nil
        Swift.Task {
            defer { isSavingBlockId = nil }
            do {
                _ = try await composition.channelRepository.resolveBlock(
                    workspaceId: workspaceId,
                    blockId: block.id
                )
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct WorkspaceHomeLoadedData {
    let workspaces: [Workspace]
    let workTasks: [WorkTask]
    let followUpTasks: [FollowUpTask]
    let requestedWorkTasks: [WorkTask]
    let assignedChannels: [Channel]
    let watchedChannels: [Channel]
    let channels: [Channel]
    let channelBlocks: [ChannelBlock]
    let reviewStates: [ChannelReviewState]
    let schedule: CallSchedule

    func snapshot(for workspaceId: WorkspaceID) throws -> HomeSnapshot {
        try HomeSnapshot(
            workspace: workspaces.first { $0.id == workspaceId },
            workTasks: workTasks,
            requestedWorkTasks: requestedWorkTasks,
            followUpTasks: followUpTasks,
            assignedChannels: assignedChannels,
            watchedChannels: watchedChannels,
            channels: channels,
            channelBlocks: channelBlocks,
            reviewStates: reviewStates,
            schedule: schedule
        )
    }
}
