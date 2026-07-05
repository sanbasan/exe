// swiftlint:disable file_length
import ExeDomain
import Foundation
import LiveKit
import Observation

public struct LiveKitCallContext: Hashable, Sendable {
    let callSessionId: String
    let workspaceId: WorkspaceID

    public init(
        workspaceId: WorkspaceID,
        callSessionId: String
    ) {
        self.callSessionId = callSessionId
        self.workspaceId = workspaceId
    }
}

@Observable
// swiftlint:disable:next type_body_length
public final class LiveKitSessionManager: @unchecked Sendable {
    public enum Phase: Sendable {
        case active
        case ended
        case lobby
    }

    public private(set) var agenda: CallAgenda?
    public private(set) var connectionState: ConnectionState = .disconnected
    public private(set) var gbrainLookups: [GBrainCallLookupActivity] = []
    public internal(set) var isAgentConnected: Bool = false
    public internal(set) var isAgentSpeaking: Bool = false
    public private(set) var isMuted: Bool = true
    public private(set) var isPushToTalkActive: Bool = false
    public internal(set) var isUserSpeaking: Bool = false
    public private(set) var phase: Phase = .lobby
    public private(set) var proposedChannelBlockDrafts: [ChannelBlockDraft] = []
    public private(set) var proposedChannelReviewDrafts: [ChannelReviewDraft] = []
    public private(set) var proposedDrafts: [FollowUpTaskDraft] = []
    public private(set) var proposedLatestInfoDrafts: [LatestInfoDraft] = []
    public private(set) var proposedPatches: [TaskPatch] = []
    public private(set) var proposedWorkTaskDrafts: [WorkTaskDraft] = []
    public private(set) var summary: String?

    let dataChannelTopic: String = "exe.call"

    @ObservationIgnored
    var interruptionObserver: (any NSObjectProtocol)?
    @ObservationIgnored
    private let room: Room
    @ObservationIgnored
    private var callContext: LiveKitCallContext?

    public init() {
        self.room = Room()
        room.add(delegate: self)
    }

    public static func configureForCallKit() {
        AudioManager.shared.isSpeakerOutputPreferred = true
    }

    public func join(
        url: String,
        token: String,
        context: LiveKitCallContext
    ) async throws {
        self.callContext = context
        try configureAudioSession()
        startInterruptionObserver()

        let connectOptions = ConnectOptions(autoSubscribe: true)
        let roomOptions = RoomOptions(
            defaultAudioCaptureOptions: AudioCaptureOptions(
                echoCancellation: .init(booleanLiteral: true),
                noiseSuppression: .init(booleanLiteral: true)
            )
        )
        do {
            try await room.connect(
                url: url,
                token: token,
                connectOptions: connectOptions,
                roomOptions: roomOptions
            )
            try await room.localParticipant.setMicrophone(enabled: false)
        } catch {
            await room.disconnect()
            stopInterruptionObserver()
            deactivateAudioSession()
            callContext = nil
            throw error
        }
        connectionState = .connected
        isMuted = true
        isPushToTalkActive = false
        phase = .active
    }

    public func beginPushToTalk() async throws {
        guard connectionState == .connected else { return }
        guard !isPushToTalkActive || isMuted else { return }

        isPushToTalkActive = true
        isMuted = false
        do {
            try await room.localParticipant.setMicrophone(enabled: true)
        } catch {
            isPushToTalkActive = false
            isMuted = true
            throw error
        }
    }

    public func endPushToTalk() async throws {
        guard isPushToTalkActive || !isMuted else { return }

        isPushToTalkActive = false
        isMuted = true
        guard connectionState == .connected else { return }
        try await room.localParticipant.setMicrophone(enabled: false)
    }

    public func toggleMute() async throws {
        guard connectionState == .connected else { return }

        let nextMutedState = !isMuted
        let previousMutedState = isMuted
        let previousPushToTalkState = isPushToTalkActive

        isPushToTalkActive = false
        isMuted = nextMutedState
        do {
            try await room.localParticipant.setMicrophone(enabled: !nextMutedState)
        } catch {
            isPushToTalkActive = previousPushToTalkState
            isMuted = previousMutedState
            throw error
        }
    }

    public func disconnect() async {
        await room.disconnect()
        stopInterruptionObserver()
        deactivateAudioSession()
        callContext = nil
        connectionState = .disconnected
        isAgentConnected = false
        isAgentSpeaking = false
        isMuted = true
        isPushToTalkActive = false
        isUserSpeaking = false
        phase = .ended
    }

    @MainActor
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    func applyMessage(_ message: CallDataChannelMessage) {
        guard
            let callContext,
            message.workspaceId == callContext.workspaceId,
            message.callSessionId == callContext.callSessionId
        else { return }

        switch message {
            case let .agenda(_, _, agenda):
                self.agenda = agenda
            case let .channelBlockDraftDiscarded(_, _, draftIds):
                removeChannelBlockDrafts(draftIds)
            case let .channelBlockDraftProposed(_, _, channelBlockDrafts):
                upsertChannelBlockDrafts(channelBlockDrafts)
            case let .channelReviewDraftDiscarded(_, _, draftIds):
                removeChannelReviewDrafts(draftIds)
            case let .channelReviewDraftProposed(_, _, channelReviewDrafts):
                upsertChannelReviewDrafts(channelReviewDrafts)
            case let .followUpTaskDraftDiscarded(_, _, draftIds):
                removeDrafts(draftIds)
            case let .followUpTaskDraftProposed(_, _, drafts):
                appendUniqueDrafts(drafts)
            case let .gbrainLookupFindings(_, _, findings):
                applyGBrainLookupFindings(findings)
            case let .gbrainSearchCompleted(_, _, search):
                applyGBrainSearchCompleted(search)
            case let .gbrainSearchStarted(_, _, search):
                applyGBrainSearchStarted(search)
            case let .latestInfoDraftProposed(_, _, latestInfoDrafts):
                upsertLatestInfoDrafts(latestInfoDrafts)
            case let .latestInfoDraftDiscarded(_, _, draftIds):
                removeLatestInfoDrafts(draftIds)
            case let .summary(_, _, summary):
                self.summary = summary
            case let .taskPatchDiscarded(_, _, draftIds):
                removePatches(draftIds)
            case let .taskPatchProposed(_, _, patches):
                appendUniquePatches(patches)
            case let .workTaskDraftDiscarded(_, _, draftIds):
                removeWorkTaskDrafts(draftIds)
            case let .workTaskDraftProposed(_, _, workTaskDrafts):
                appendUniqueWorkTaskDrafts(workTaskDrafts)
        }
    }

    private func applyGBrainSearchStarted(_ search: GBrainCallSearchStarted) {
        let key = search.lookupId ?? search.id
        let index = gbrainLookupIndex(forKey: key, channelId: search.channelId)
        if gbrainLookups[index].searches.contains(where: { $0.id == search.id }) { return }
        gbrainLookups[index].searches.append(
            GBrainCallLookupActivity.Search(id: search.id, query: search.query, state: .searching)
        )
    }

    private func applyGBrainSearchCompleted(_ search: GBrainCallSearchCompleted) {
        let key = search.lookupId ?? search.id
        let index = gbrainLookupIndex(forKey: key, channelId: search.channelId)
        let state: GBrainCallLookupActivity.State = search.status == .ok ? .ok : .error
        if let searchIndex = gbrainLookups[index].searches.firstIndex(where: { $0.id == search.id }) {
            gbrainLookups[index].searches[searchIndex].state = state
        } else {
            gbrainLookups[index].searches.append(
                GBrainCallLookupActivity.Search(id: search.id, query: search.query, state: state)
            )
        }
    }

    private func applyGBrainLookupFindings(_ findings: GBrainCallLookupFindings) {
        let index = gbrainLookupIndex(forKey: findings.lookupId, channelId: findings.channelId)
        gbrainLookups[index].bullets = findings.bullets
    }

    /// Returns the index of the lookup for `key`, creating it (appended last so
    /// newest lands on top when the view reverses) if it does not yet exist.
    /// Backfills a missing `channelId` from later messages that carry one.
    private func gbrainLookupIndex(forKey key: String, channelId: SlackChannelID?) -> Int {
        if let index = gbrainLookups.firstIndex(where: { $0.id == key }) {
            if gbrainLookups[index].channelId == nil, let channelId {
                gbrainLookups[index].channelId = channelId
            }
            return index
        }
        gbrainLookups.append(GBrainCallLookupActivity(id: key, channelId: channelId))
        return gbrainLookups.count - 1
    }

    private func appendUniqueDrafts(_ drafts: [FollowUpTaskDraft]) {
        var seen = Set(proposedDrafts)
        proposedDrafts.append(contentsOf: drafts.filter { seen.insert($0).inserted })
    }

    private func upsertLatestInfoDrafts(_ drafts: [LatestInfoDraft]) {
        for draft in drafts {
            if
                let index = proposedLatestInfoDrafts.firstIndex(where: { existing in
                    if let draftId = draft.draftId, let existingId = existing.draftId {
                        return draftId == existingId
                    }
                    return existing.channelId == draft.channelId
                })
            {
                proposedLatestInfoDrafts[index] = draft
            } else {
                proposedLatestInfoDrafts.append(draft)
            }
        }
    }

    private func removeLatestInfoDrafts(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedLatestInfoDrafts.removeAll { draft in
            guard let draftId = draft.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func upsertChannelReviewDrafts(_ drafts: [ChannelReviewDraft]) {
        for draft in drafts {
            if
                let index = proposedChannelReviewDrafts.firstIndex(where: { existing in
                    if let draftId = draft.draftId, let existingId = existing.draftId {
                        return draftId == existingId
                    }
                    return existing.channelId == draft.channelId
                })
            {
                proposedChannelReviewDrafts[index] = draft
            } else {
                proposedChannelReviewDrafts.append(draft)
            }
        }
    }

    private func removeChannelReviewDrafts(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedChannelReviewDrafts.removeAll { draft in
            guard let draftId = draft.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func upsertChannelBlockDrafts(_ drafts: [ChannelBlockDraft]) {
        for draft in drafts {
            if
                let index = proposedChannelBlockDrafts.firstIndex(where: { existing in
                    if let draftId = draft.draftId, let existingId = existing.draftId {
                        return draftId == existingId
                    }
                    return existing.action == draft.action && existing.blockId == draft.blockId
                })
            {
                proposedChannelBlockDrafts[index] = draft
            } else {
                proposedChannelBlockDrafts.append(draft)
            }
        }
    }

    private func removeChannelBlockDrafts(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedChannelBlockDrafts.removeAll { draft in
            guard let draftId = draft.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func removeDrafts(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedDrafts.removeAll { draft in
            guard let draftId = draft.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func removePatches(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedPatches.removeAll { patch in
            guard let draftId = patch.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func removeWorkTaskDrafts(_ draftIds: [String]) {
        let ids = Set(draftIds)
        proposedWorkTaskDrafts.removeAll { draft in
            guard let draftId = draft.draftId else { return false }
            return ids.contains(draftId)
        }
    }

    private func appendUniquePatches(_ patches: [TaskPatch]) {
        var seen = Set(proposedPatches)
        proposedPatches.append(contentsOf: patches.filter { seen.insert($0).inserted })
    }

    private func appendUniqueWorkTaskDrafts(_ drafts: [WorkTaskDraft]) {
        var seen = Set(proposedWorkTaskDrafts)
        proposedWorkTaskDrafts.append(contentsOf: drafts.filter { seen.insert($0).inserted })
    }
}
