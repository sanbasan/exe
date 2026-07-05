import AVFoundation
import CallKit
import Foundation
import Observation

@Observable
final class CallKitManager: NSObject, @unchecked Sendable {
    struct PendingCall {
        let callSessionId: String
        let title: String
        let uuid: UUID
        let workspaceId: String
    }

    private(set) var activeCallUUID: UUID?
    var onAnswerCall: ((_ workspaceId: String, _ callSessionId: String) -> Void)?

    @ObservationIgnored
    private var pendingCalls: [UUID: PendingCall] = [:]
    @ObservationIgnored
    private let provider: CXProvider
    @ObservationIgnored
    private let callController: CXCallController

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.ringtoneSound = "ringtone.caf"

        self.provider = CXProvider(configuration: configuration)
        self.callController = CXCallController()
        super.init()
        provider.setDelegate(self, queue: .main)
    }

    // swiftlint:disable:next function_parameter_count
    func reportIncomingCall(
        uuid: UUID,
        workspaceId: String,
        callSessionId: String,
        title: String
    ) {
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetoothHFP, .defaultToSpeaker]
        )

        pendingCalls[uuid] = PendingCall(
            callSessionId: callSessionId,
            title: title,
            uuid: uuid,
            workspaceId: workspaceId
        )

        let update = CXCallUpdate()
        update.localizedCallerName = title
        update.remoteHandle = CXHandle(type: .generic, value: callSessionId)
        update.hasVideo = false
        update.supportsDTMF = false
        update.supportsGrouping = false
        update.supportsHolding = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if error != nil {
                Task { @MainActor [weak self] in
                    self?.pendingCalls.removeValue(forKey: uuid)
                }
            }
        }
    }

    func endActiveCall() {
        guard let uuid = activeCallUUID else { return }
        let action = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: action)) { _ in }
    }
}

extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_: CXProvider) {
        activeCallUUID = nil
        pendingCalls.removeAll()
    }

    func provider(
        _: CXProvider,
        perform action: CXAnswerCallAction
    ) {
        guard let call = pendingCalls[action.callUUID] else {
            action.fail()
            return
        }

        activeCallUUID = action.callUUID
        pendingCalls.removeValue(forKey: action.callUUID)
        onAnswerCall?(call.workspaceId, call.callSessionId)
        action.fulfill()
    }

    func provider(
        _: CXProvider,
        perform action: CXEndCallAction
    ) {
        if activeCallUUID == action.callUUID {
            activeCallUUID = nil
        }
        pendingCalls.removeValue(forKey: action.callUUID)
        action.fulfill()
    }

    func provider(
        _: CXProvider,
        didActivate _: AVAudioSession
    ) {}

    func provider(
        _: CXProvider,
        didDeactivate _: AVAudioSession
    ) {}
}
