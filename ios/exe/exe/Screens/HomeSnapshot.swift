import ExeDomain
import Foundation

struct HomeSnapshot {
    private static let scheduledStartGraceSeconds: TimeInterval = 10 * 60

    let assignedChannels: [Channel]
    let channelBlocks: [ChannelBlock]
    let channels: [Channel]
    let followUpTasks: [FollowUpTask]
    let requestedWorkTasks: [WorkTask]
    let reviewStates: [ChannelReviewState]
    let schedule: CallSchedule
    let watchedChannels: [Channel]
    let workTasks: [WorkTask]
    let workspace: Workspace

    init(
        workspace: Workspace?,
        workTasks: [WorkTask],
        requestedWorkTasks: [WorkTask],
        followUpTasks: [FollowUpTask],
        assignedChannels: [Channel],
        watchedChannels: [Channel],
        channels: [Channel],
        channelBlocks: [ChannelBlock],
        reviewStates: [ChannelReviewState],
        schedule: CallSchedule
    ) throws {
        guard let workspace else {
            throw APIStateError.workspaceNotFound
        }
        self.assignedChannels = assignedChannels
        self.channelBlocks = channelBlocks
        self.channels = channels
        self.followUpTasks = followUpTasks
        let assignedTaskIds = Set(workTasks.map(\.id))
        self.requestedWorkTasks = requestedWorkTasks.filter { !assignedTaskIds.contains($0.id) }
        self.reviewStates = reviewStates
        self.schedule = schedule
        self.watchedChannels = watchedChannels
        self.workTasks = workTasks
        self.workspace = workspace
    }

    private var language: Language {
        workspace.language
    }

    private var timeZone: TimeZone {
        TimeZone(identifier: schedule.timezone) ?? .current
    }

    func dueAtText(_ dueAt: DateTime?) -> String? {
        guard let dueAt else {
            return nil
        }

        return ExeDateFormatting.displayString(
            isoDateTime: dueAt,
            language: language,
            timeZone: timeZone
        )
    }

    var shouldDefaultManualStartToScheduledRun: Bool {
        guard
            schedule.enabled,
            let nextRunAt = schedule.nextRunAt,
            let runAt = ExeDateFormatting.parseISODate(nextRunAt)
        else { return false }

        let now = Date()
        let windowStart = runAt.addingTimeInterval(TimeInterval(-max(schedule.preNotifyMinutes, 0) * 60))
        let windowEnd = runAt.addingTimeInterval(Self.scheduledStartGraceSeconds)

        return windowStart <= now && now < windowEnd
    }

    var scheduleText: String {
        guard schedule.enabled else {
            return String(localized: "Regular calls are off")
        }

        if let nextRunAt = schedule.nextRunAt {
            return ExeDateFormatting.displayString(
                isoDateTime: nextRunAt,
                language: language,
                timeZone: timeZone
            )
        }

        return "\(schedule.timeOfDay) \(schedule.timezone)"
    }

    var nextCallTitle: String {
        guard schedule.enabled else {
            return String(localized: "No schedule")
        }

        return String(localized: "Next call")
    }

    var homeChannels: [Channel] {
        let activeChannels = channels.filter { $0.status == .active }
        let activeChannelIds = Set(activeChannels.map(\.channelId))
        let allWorkTasks = workTasks + requestedWorkTasks
        let taskChannelIds = Set(allWorkTasks.compactMap(\.channelId))
        let taskChannels = activeChannels.filter { taskChannelIds.contains($0.channelId) }
        let activeAssignedChannels = assignedChannels.filter { $0.status == .active }
        let activeWatchedChannels = watchedChannels.filter { $0.status == .active }
        let channels = activeAssignedChannels + activeWatchedChannels + taskChannels
        let unique = Dictionary(grouping: channels) { $0.channelId }
            .compactMap { _, values in values.first }
            .filter { activeChannelIds.contains($0.channelId) }

        return unique.sorted { $0.createdAt < $1.createdAt }
    }

    var visibleHomeChannels: [Channel] {
        homeChannels.filter { hasVisibleContent(for: $0) }
    }

    func activeBlocks(for channel: Channel) -> [ChannelBlock] {
        channelBlocks
            .filter { $0.status == .active && $0.channelId == channel.channelId }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func assignedWorkTasks(for channel: Channel) -> [WorkTask] {
        workTasks
            .filter { $0.channelId == channel.channelId }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func requestedWorkTasks(for channel: Channel) -> [WorkTask] {
        requestedWorkTasks
            .filter { $0.channelId == channel.channelId }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func reviewStates(for channel: Channel) -> [ChannelReviewState] {
        reviewStates
            .filter { $0.channelId == channel.channelId && reviewStateBody($0) != nil }
            .sorted { reviewStateSortDate($0) > reviewStateSortDate($1) }
    }

    func reviewStateBody(_ state: ChannelReviewState) -> String? {
        let body = (state.statusText ?? state.lastSelfReport ?? "").homeTrimmed
        return body.isEmpty ? nil : body
    }

    func reviewStateDateText(_ state: ChannelReviewState) -> String? {
        dueAtText(state.statusUpdatedAt ?? state.lastCheckedAt ?? state.updatedAt)
    }

    private func reviewStateSortDate(_ state: ChannelReviewState) -> Date {
        ExeDateFormatting.parseISODate(state.statusUpdatedAt ?? state.updatedAt) ?? .distantPast
    }

    private func hasVisibleContent(for channel: Channel) -> Bool {
        if let latestInfo = channel.latestInfo, !latestInfo.homeTrimmed.isEmpty {
            return true
        }

        return !activeBlocks(for: channel).isEmpty ||
            !assignedWorkTasks(for: channel).isEmpty ||
            !requestedWorkTasks(for: channel).isEmpty ||
            !reviewStates(for: channel).isEmpty
    }
}

enum APIStateError: LocalizedError {
    case workspaceNotFound

    var errorDescription: String? {
        String(localized: "Workspace was not found for this account.")
    }
}
