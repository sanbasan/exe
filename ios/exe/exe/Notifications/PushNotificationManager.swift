import ExeAPIClient
import ExeDomain
import FirebaseMessaging
import Foundation
import Observation
import UIKit
import UserNotifications

@Observable
final class PushNotificationManager: NSObject, @unchecked Sendable {
    var fcmToken: String?
    var onNotificationTap: ((_ workspaceId: String, _ callSessionId: String) -> Void)?

    private var deviceTokenRepository: DeviceTokenRepository?
    private var isAuthReady: Bool = false
    private var registeredToken: String?

    func configureDelegates() {
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
    }

    func configureRepository(deviceTokenRepository: DeviceTokenRepository) {
        self.deviceTokenRepository = deviceTokenRepository
    }

    func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            return granted
        } catch {
            return false
        }
    }

    func markAuthReady() async {
        isAuthReady = true
        await registerIfReady()
    }

    func markAuthSignedOut() async {
        isAuthReady = false
        registeredToken = nil
    }

    private func registerIfReady() async {
        guard isAuthReady else { return }
        guard let token = fcmToken else { return }
        guard registeredToken != token else { return }
        guard let repository = deviceTokenRepository else { return }

        if
            await (try? repository.register(
                token: token,
                kind: .fcm,
                environment: Bundle.main.exeEnvironment
            )) != nil
        {
            registeredToken = token
        }
    }
}

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        guard
            let workspaceId = userInfo["workspaceId"] as? String,
            let callSessionId = userInfo["callSessionId"] as? String
        else { return }

        onNotificationTap?(workspaceId, callSessionId)
    }
}

extension PushNotificationManager: MessagingDelegate {
    func messaging(
        _: Messaging,
        didReceiveRegistrationToken fcmToken: String?
    ) {
        guard let fcmToken else { return }
        self.fcmToken = fcmToken

        Swift.Task {
            await registerIfReady()
        }
    }
}
