import ExeDomain
import Foundation
import LiveKit

extension LiveKitSessionManager: RoomDelegate {
    // swiftlint:disable:next function_parameter_count
    public func room(
        _: Room,
        participant _: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType _: EncryptionType
    ) {
        guard topic == dataChannelTopic else { return }
        guard let message = try? CallDataChannelMessage.fromData(data) else { return }

        Swift.Task { @MainActor in
            self.applyMessage(message)
        }
    }

    public func room(
        _: Room,
        participantDidConnect participant: RemoteParticipant
    ) {
        guard participant.identity?.stringValue.hasPrefix("agent") == true else { return }
        Swift.Task { @MainActor in
            self.isAgentConnected = true
        }
    }

    public func room(
        _: Room,
        participantDidDisconnect participant: RemoteParticipant
    ) {
        guard participant.identity?.stringValue.hasPrefix("agent") == true else { return }
        Swift.Task { @MainActor in
            self.isAgentConnected = false
            self.isAgentSpeaking = false
        }
    }

    public func room(
        _: Room,
        didUpdateSpeakingParticipants participants: [Participant]
    ) {
        // `participants` is the full list of currently active speakers,
        // so an empty list resets both flags to false.
        let isAgentSpeaking = participants.contains {
            $0.identity?.stringValue.hasPrefix("agent") == true && $0.isSpeaking
        }
        let isUserSpeaking = participants.contains {
            $0 is LocalParticipant && $0.isSpeaking
        }

        Swift.Task { @MainActor in
            self.isAgentSpeaking = isAgentSpeaking
            self.isUserSpeaking = isUserSpeaking
        }
    }
}
