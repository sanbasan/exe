import ExeDomain
import Foundation

#if DEBUG
private struct WorkspaceHomePreviewPayload: Decodable {
    let assignedChannels: [Channel]
    let channelBlocks: [ChannelBlock]?
    let channels: [Channel]
    let followUpTasks: [FollowUpTask]
    let requestedWorkTasks: [WorkTask]
    let reviewStates: [ChannelReviewState]?
    let schedule: CallSchedule
    let watchedChannels: [Channel]?
    let workTasks: [WorkTask]
    let workspace: Workspace
}

private struct WorkspaceHomePreviewSnapshotInput {
    let workspace: Workspace
    let schedule: CallSchedule
    let workTasks: [WorkTask]
    let requestedWorkTasks: [WorkTask]
    let followUpTasks: [FollowUpTask]
    let assignedChannels: [Channel]
    let watchedChannels: [Channel]
    let channels: [Channel]
    var channelBlocks: [ChannelBlock] = []
    var reviewStates: [ChannelReviewState] = []
}

enum WorkspaceHomePreviewData {
    static let loaded: HomeSnapshot = snapshot(from: WorkspaceHomePreviewFixture.loadedJSON)
    static let empty: HomeSnapshot = {
        let decoded = payload(from: WorkspaceHomePreviewFixture.loadedJSON)
        return makeSnapshot(
            WorkspaceHomePreviewSnapshotInput(
                workspace: decoded.workspace,
                schedule: decoded.schedule,
                workTasks: [],
                requestedWorkTasks: [],
                followUpTasks: [],
                assignedChannels: [],
                watchedChannels: [],
                channels: []
            )
        )
    }()

    static let setupRequired: HomeSnapshot = {
        let decoded = payload(from: WorkspaceHomePreviewFixture.loadedJSON)
        return makeSnapshot(
            WorkspaceHomePreviewSnapshotInput(
                workspace: workspace(decoded.workspace, hasAdmins: false),
                schedule: decoded.schedule,
                workTasks: [],
                requestedWorkTasks: [],
                followUpTasks: [],
                assignedChannels: [],
                watchedChannels: [],
                channels: []
            )
        )
    }()

    private static func snapshot(from json: String) -> HomeSnapshot {
        let payload = payload(from: json)
        return makeSnapshot(
            WorkspaceHomePreviewSnapshotInput(
                workspace: payload.workspace,
                schedule: payload.schedule,
                workTasks: payload.workTasks,
                requestedWorkTasks: payload.requestedWorkTasks,
                followUpTasks: payload.followUpTasks,
                assignedChannels: payload.assignedChannels,
                watchedChannels: payload.watchedChannels ?? [],
                channels: payload.channels,
                channelBlocks: payload.channelBlocks ?? [],
                reviewStates: payload.reviewStates ?? []
            )
        )
    }

    private static func payload(from json: String) -> WorkspaceHomePreviewPayload {
        guard let data = json.data(using: .utf8) else {
            fatalError("Preview JSON is not UTF-8.")
        }

        do {
            return try JSONDecoder().decode(WorkspaceHomePreviewPayload.self, from: data)
        } catch {
            fatalError("Workspace home preview failed to decode: \(error)")
        }
    }

    private static func makeSnapshot(_ input: WorkspaceHomePreviewSnapshotInput) -> HomeSnapshot {
        do {
            return try HomeSnapshot(
                workspace: input.workspace,
                workTasks: input.workTasks,
                requestedWorkTasks: input.requestedWorkTasks,
                followUpTasks: input.followUpTasks,
                assignedChannels: input.assignedChannels,
                watchedChannels: input.watchedChannels,
                channels: input.channels,
                channelBlocks: input.channelBlocks,
                reviewStates: input.reviewStates,
                schedule: input.schedule
            )
        } catch {
            fatalError("Workspace home preview failed to build snapshot: \(error)")
        }
    }

    private static func workspace(_ workspace: Workspace, hasAdmins: Bool) -> Workspace {
        Workspace(
            admin: workspace.admin,
            botUserId: workspace.botUserId,
            canManageWorkspaceSettings: workspace.canManageWorkspaceSettings,
            channelOwnerEditors: workspace.channelOwnerEditors,
            hasAdmins: hasAdmins,
            id: workspace.id,
            language: workspace.language,
            name: workspace.name,
            slackTeamId: workspace.slackTeamId,
            timezone: workspace.timezone
        )
    }
}
#endif
