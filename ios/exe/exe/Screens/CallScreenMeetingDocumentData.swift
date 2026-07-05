import ExeDomain
import ExeUI
import SwiftUI

extension MeetingDocumentPanel {
    var channelItems: [ChannelReviewAgendaItem] {
        agenda?.channelReviews ?? []
    }

    var diffBuilder: PatchDiffBuilder {
        PatchDiffBuilder(
            channelLabel: channelLabel,
            memberLabel: memberLabel,
            taskStatusLabel: taskStatusLabel
        )
    }

    private var channelIdSet: Set<SlackChannelID> {
        Set(channelItems.map(\.channel.channelId))
    }

    var unassignedPatches: [TaskPatch] {
        proposedPatches.filter { patch in
            guard let channelId = patchChannelId(patch) else { return true }
            return !channelIdSet.contains(channelId)
        }
    }

    var unassignedDrafts: [FollowUpTaskDraft] {
        proposedDrafts.filter { draft in
            guard let channelId = draft.channelId else { return true }
            return !channelIdSet.contains(channelId)
        }
    }

    var unassignedWorkDrafts: [WorkTaskDraft] {
        proposedWorkTaskDrafts.filter { draft in
            guard let channelId = draft.channelId else { return true }
            return !channelIdSet.contains(channelId)
        }
    }

    var tabs: [MeetingDocumentTabEntry] {
        var entries: [MeetingDocumentTabEntry] = []
        if !gbrainLookups.isEmpty {
            entries.append(MeetingDocumentTabEntry(tab: .gbrain, title: "GBrain"))
        }
        entries.append(contentsOf: channelItems.map { item in
            MeetingDocumentTabEntry(
                tab: .channel(item.channel.channelId),
                title: "#\(item.channel.name)"
            )
        })
        let otherCount = unassignedPatches.count + unassignedDrafts.count + unassignedWorkDrafts.count
        if otherCount > 0 || entries.isEmpty {
            entries.append(
                MeetingDocumentTabEntry(tab: .other, title: String(localized: "Other"))
            )
        }
        return entries
    }

    func channelDisplayName(for channelId: SlackChannelID) -> String? {
        if let channel = agenda?.channels.first(where: { $0.channelId == channelId }) {
            return channel.name
        }
        if let item = channelItems.first(where: { $0.channel.channelId == channelId }) {
            return item.channel.name
        }
        return nil
    }

    func latestPatchByTaskId() -> [String: TaskPatch] {
        proposedPatches.reduce(into: [:]) { result, patch in
            result[patch.taskId] = patch
        }
    }

    func drafts(forChannel channelId: SlackChannelID) -> [FollowUpTaskDraft] {
        proposedDrafts.filter { $0.channelId == channelId }
    }

    func latestInfoDraft(forChannel channelId: SlackChannelID) -> LatestInfoDraft? {
        proposedLatestInfoDrafts.first { $0.channelId == channelId }
    }

    func reviewDraft(forChannel channelId: SlackChannelID) -> ChannelReviewDraft? {
        proposedChannelReviewDrafts.first { $0.channelId == channelId }
    }

    func blockDrafts(forChannel channelId: SlackChannelID) -> [ChannelBlockDraft] {
        proposedChannelBlockDrafts.filter { $0.channelId == channelId }
    }

    func workDrafts(forChannel channelId: SlackChannelID) -> [WorkTaskDraft] {
        proposedWorkTaskDrafts.filter { $0.channelId == channelId }
    }

    private func patchChannelId(_ patch: TaskPatch) -> SlackChannelID? {
        switch patch.after {
            case let .followUp(after):
                after.channelId
            case let .work(after):
                after.channelId
        }
    }
}
