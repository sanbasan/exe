// swiftlint:disable file_length
import Foundation

// swiftlint:disable:next type_body_length
public enum CallDataChannelMessage: Codable, Hashable, Sendable {
    case agenda(workspaceId: WorkspaceID, callSessionId: String, agenda: CallAgenda)
    case channelBlockDraftDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case channelBlockDraftProposed(
        workspaceId: WorkspaceID,
        callSessionId: String,
        channelBlockDrafts: [ChannelBlockDraft]
    )
    case channelReviewDraftDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case channelReviewDraftProposed(
        workspaceId: WorkspaceID,
        callSessionId: String,
        channelReviewDrafts: [ChannelReviewDraft]
    )
    case followUpTaskDraftDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case followUpTaskDraftProposed(workspaceId: WorkspaceID, callSessionId: String, drafts: [FollowUpTaskDraft])
    case gbrainLookupFindings(workspaceId: WorkspaceID, callSessionId: String, findings: GBrainCallLookupFindings)
    case gbrainSearchCompleted(workspaceId: WorkspaceID, callSessionId: String, search: GBrainCallSearchCompleted)
    case gbrainSearchStarted(workspaceId: WorkspaceID, callSessionId: String, search: GBrainCallSearchStarted)
    case latestInfoDraftDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case latestInfoDraftProposed(workspaceId: WorkspaceID, callSessionId: String, latestInfoDrafts: [LatestInfoDraft])
    case summary(workspaceId: WorkspaceID, callSessionId: String, summary: String)
    case taskPatchDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case taskPatchProposed(workspaceId: WorkspaceID, callSessionId: String, patches: [TaskPatch])
    case workTaskDraftDiscarded(workspaceId: WorkspaceID, callSessionId: String, draftIds: [String])
    case workTaskDraftProposed(workspaceId: WorkspaceID, callSessionId: String, workTaskDrafts: [WorkTaskDraft])

    private enum CodingKeys: String, CodingKey {
        case agenda
        case callSessionId
        case channelBlockDrafts
        case channelReviewDrafts
        case draftIds
        case drafts
        case findings
        case latestInfoDrafts
        case patches
        case search
        case summary
        case type
        case workspaceId
        case workTaskDrafts
    }

    // swiftlint:disable:next function_body_length cyclomatic_complexity
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
            case "agenda":
                self = try .agenda(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    agenda: container.decode(CallAgenda.self, forKey: .agenda)
                )
            case "channel_block_draft_discarded":
                self = try .channelBlockDraftDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "channel_block_draft_proposed":
                self = try .channelBlockDraftProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    channelBlockDrafts: container.decode([ChannelBlockDraft].self, forKey: .channelBlockDrafts)
                )
            case "channel_review_draft_discarded":
                self = try .channelReviewDraftDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "channel_review_draft_proposed":
                self = try .channelReviewDraftProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    channelReviewDrafts: container.decode([ChannelReviewDraft].self, forKey: .channelReviewDrafts)
                )
            case "follow_up_task_draft_discarded":
                self = try .followUpTaskDraftDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "follow_up_task_draft_proposed":
                self = try .followUpTaskDraftProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    drafts: container.decode([FollowUpTaskDraft].self, forKey: .drafts)
                )
            case "gbrain_lookup_findings":
                self = try .gbrainLookupFindings(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    findings: container.decode(GBrainCallLookupFindings.self, forKey: .findings)
                )
            case "gbrain_search_completed":
                self = try .gbrainSearchCompleted(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    search: container.decode(GBrainCallSearchCompleted.self, forKey: .search)
                )
            case "gbrain_search_started":
                self = try .gbrainSearchStarted(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    search: container.decode(GBrainCallSearchStarted.self, forKey: .search)
                )
            case "latest_info_draft_proposed":
                self = try .latestInfoDraftProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    latestInfoDrafts: container.decode([LatestInfoDraft].self, forKey: .latestInfoDrafts)
                )
            case "latest_info_draft_discarded":
                self = try .latestInfoDraftDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "summary":
                self = try .summary(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    summary: container.decode(String.self, forKey: .summary)
                )
            case "task_patch_discarded":
                self = try .taskPatchDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "task_patch_proposed":
                self = try .taskPatchProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    patches: container.decode([TaskPatch].self, forKey: .patches)
                )
            case "work_task_draft_discarded":
                self = try .workTaskDraftDiscarded(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    draftIds: container.decode([String].self, forKey: .draftIds)
                )
            case "work_task_draft_proposed":
                self = try .workTaskDraftProposed(
                    workspaceId: container.decode(WorkspaceID.self, forKey: .workspaceId),
                    callSessionId: container.decode(String.self, forKey: .callSessionId),
                    workTaskDrafts: container.decode([WorkTaskDraft].self, forKey: .workTaskDrafts)
                )
            default:
                throw DecodingError.dataCorruptedError(
                    forKey: .type,
                    in: container,
                    debugDescription: "Unknown call data channel message type: \(type)"
                )
        }
    }

    // swiftlint:disable:next function_body_length cyclomatic_complexity
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
            case let .agenda(workspaceId, callSessionId, agenda):
                try container.encode("agenda", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(agenda, forKey: .agenda)
            case let .channelBlockDraftDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("channel_block_draft_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .channelBlockDraftProposed(workspaceId, callSessionId, channelBlockDrafts):
                try container.encode("channel_block_draft_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(channelBlockDrafts, forKey: .channelBlockDrafts)
            case let .channelReviewDraftDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("channel_review_draft_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .channelReviewDraftProposed(workspaceId, callSessionId, channelReviewDrafts):
                try container.encode("channel_review_draft_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(channelReviewDrafts, forKey: .channelReviewDrafts)
            case let .followUpTaskDraftDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("follow_up_task_draft_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .followUpTaskDraftProposed(workspaceId, callSessionId, drafts):
                try container.encode("follow_up_task_draft_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(drafts, forKey: .drafts)
            case let .gbrainLookupFindings(workspaceId, callSessionId, findings):
                try container.encode("gbrain_lookup_findings", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(findings, forKey: .findings)
            case let .gbrainSearchCompleted(workspaceId, callSessionId, search):
                try container.encode("gbrain_search_completed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(search, forKey: .search)
            case let .gbrainSearchStarted(workspaceId, callSessionId, search):
                try container.encode("gbrain_search_started", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(search, forKey: .search)
            case let .latestInfoDraftProposed(workspaceId, callSessionId, latestInfoDrafts):
                try container.encode("latest_info_draft_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(latestInfoDrafts, forKey: .latestInfoDrafts)
            case let .latestInfoDraftDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("latest_info_draft_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .summary(workspaceId, callSessionId, summary):
                try container.encode("summary", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(summary, forKey: .summary)
            case let .taskPatchDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("task_patch_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .taskPatchProposed(workspaceId, callSessionId, patches):
                try container.encode("task_patch_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(patches, forKey: .patches)
            case let .workTaskDraftDiscarded(workspaceId, callSessionId, draftIds):
                try container.encode("work_task_draft_discarded", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(draftIds, forKey: .draftIds)
            case let .workTaskDraftProposed(workspaceId, callSessionId, workTaskDrafts):
                try container.encode("work_task_draft_proposed", forKey: .type)
                try container.encode(workspaceId, forKey: .workspaceId)
                try container.encode(callSessionId, forKey: .callSessionId)
                try container.encode(workTaskDrafts, forKey: .workTaskDrafts)
        }
    }
}

public extension CallDataChannelMessage {
    var callSessionId: String {
        switch self {
            case let .agenda(_, callSessionId, _):
                callSessionId
            case let .channelBlockDraftDiscarded(_, callSessionId, _):
                callSessionId
            case let .channelBlockDraftProposed(_, callSessionId, _):
                callSessionId
            case let .channelReviewDraftDiscarded(_, callSessionId, _):
                callSessionId
            case let .channelReviewDraftProposed(_, callSessionId, _):
                callSessionId
            case let .followUpTaskDraftDiscarded(_, callSessionId, _):
                callSessionId
            case let .followUpTaskDraftProposed(_, callSessionId, _):
                callSessionId
            case let .gbrainLookupFindings(_, callSessionId, _):
                callSessionId
            case let .gbrainSearchCompleted(_, callSessionId, _):
                callSessionId
            case let .gbrainSearchStarted(_, callSessionId, _):
                callSessionId
            case let .latestInfoDraftDiscarded(_, callSessionId, _):
                callSessionId
            case let .latestInfoDraftProposed(_, callSessionId, _):
                callSessionId
            case let .summary(_, callSessionId, _):
                callSessionId
            case let .taskPatchDiscarded(_, callSessionId, _):
                callSessionId
            case let .taskPatchProposed(_, callSessionId, _):
                callSessionId
            case let .workTaskDraftDiscarded(_, callSessionId, _):
                callSessionId
            case let .workTaskDraftProposed(_, callSessionId, _):
                callSessionId
        }
    }

    var workspaceId: WorkspaceID {
        switch self {
            case let .agenda(workspaceId, _, _):
                workspaceId
            case let .channelBlockDraftDiscarded(workspaceId, _, _):
                workspaceId
            case let .channelBlockDraftProposed(workspaceId, _, _):
                workspaceId
            case let .channelReviewDraftDiscarded(workspaceId, _, _):
                workspaceId
            case let .channelReviewDraftProposed(workspaceId, _, _):
                workspaceId
            case let .followUpTaskDraftDiscarded(workspaceId, _, _):
                workspaceId
            case let .followUpTaskDraftProposed(workspaceId, _, _):
                workspaceId
            case let .gbrainLookupFindings(workspaceId, _, _):
                workspaceId
            case let .gbrainSearchCompleted(workspaceId, _, _):
                workspaceId
            case let .gbrainSearchStarted(workspaceId, _, _):
                workspaceId
            case let .latestInfoDraftDiscarded(workspaceId, _, _):
                workspaceId
            case let .latestInfoDraftProposed(workspaceId, _, _):
                workspaceId
            case let .summary(workspaceId, _, _):
                workspaceId
            case let .taskPatchDiscarded(workspaceId, _, _):
                workspaceId
            case let .taskPatchProposed(workspaceId, _, _):
                workspaceId
            case let .workTaskDraftDiscarded(workspaceId, _, _):
                workspaceId
            case let .workTaskDraftProposed(workspaceId, _, _):
                workspaceId
        }
    }

    static func fromData(_ data: Data) throws -> CallDataChannelMessage {
        try JSONDecoder().decode(CallDataChannelMessage.self, from: data)
    }
}
