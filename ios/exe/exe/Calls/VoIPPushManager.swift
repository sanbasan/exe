import ExeAPIClient
import ExeDomain
import Foundation
import PushKit

final class VoIPPushManager: NSObject, PKPushRegistryDelegate, @unchecked Sendable {
    private let callKitManager: CallKitManager
    private let registry: PKPushRegistry
    private var deviceTokenRepository: DeviceTokenRepository?
    private var isAuthReady: Bool = false
    private var currentToken: String?
    private var registeredToken: String?

    init(callKitManager: CallKitManager) {
        self.callKitManager = callKitManager
        self.registry = PKPushRegistry(queue: .main)
        super.init()
        registry.delegate = self
    }

    func configureRepository(deviceTokenRepository: DeviceTokenRepository) {
        self.deviceTokenRepository = deviceTokenRepository
    }

    func startRegistration() {
        registry.desiredPushTypes = [.voIP]
    }

    func markAuthReady() async {
        isAuthReady = true
        await registerIfReady()
    }

    func markAuthSignedOut() async {
        isAuthReady = false
        registeredToken = nil
    }

    nonisolated func pushRegistry(
        _: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for _: PKPushType
    ) {
        let token = pushCredentials.token
            .map { String(format: "%02x", $0) }
            .joined()

        Swift.Task { @MainActor in
            self.currentToken = token
            await self.registerIfReady()
        }
    }

    // swiftlint:disable:next function_parameter_count
    nonisolated func pushRegistry(
        _: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for _: PKPushType,
        completion: @escaping () -> Void
    ) {
        let data = payload.dictionaryPayload
        guard
            let callSessionId = data["callSessionId"] as? String,
            let workspaceId = data["workspaceId"] as? String
        else {
            completion()
            return
        }
        let title = data["title"] as? String ?? "exe task review"
        let uuid = UUID()

        MainActor.assumeIsolated {
            callKitManager.reportIncomingCall(
                uuid: uuid,
                workspaceId: workspaceId,
                callSessionId: callSessionId,
                title: title
            )
        }
        completion()
    }

    nonisolated func pushRegistry(
        _: PKPushRegistry,
        didInvalidatePushTokenFor _: PKPushType
    ) {
        Swift.Task { @MainActor in
            self.currentToken = nil
            self.registeredToken = nil
        }
    }

    private func registerIfReady() async {
        guard isAuthReady else { return }
        guard let token = currentToken else { return }
        guard registeredToken != token else { return }
        guard let repository = deviceTokenRepository else { return }

        if
            await (try? repository.register(
                token: token,
                kind: .voip,
                environment: Bundle.main.exeEnvironment
            )) != nil
        {
            registeredToken = token
        }
    }
}
