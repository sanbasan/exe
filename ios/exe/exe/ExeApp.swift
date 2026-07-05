import ExeAPIClient
import ExeLiveKit
import ExeUI
import FirebaseMessaging
import SwiftUI

@main
struct ExeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self)
    private var appDelegate
    @State
    private var composition = AppComposition.live
    @State
    private var router = AppRouter()
    @AppStorage(AppLanguage.storageKey)
    private var appLanguageRawValue = AppLanguage.system.rawValue
    @Environment(\.scenePhase)
    private var scenePhase

    init() {
        Observability.bootstrap()
        Observability.recordAppLaunchConfigured()
    }

    var body: some Scene {
        WindowGroup {
            RootView(callKitManager: appDelegate.callKitManager)
                .environment(composition)
                .environment(router)
                .environment(\.locale, appLocale)
                .tint(ExeColors.accent)
                .task { setupPushNotifications() }
                .task { setupCallKit() }
                .onOpenURL { url in
                    route(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    route(url: url)
                }
                .onChange(of: scenePhase) { _, phase in
                    Observability.recordScenePhase(String(describing: phase))
                }
        }
    }

    private var appLocale: Locale {
        let language = AppLanguage(rawValue: appLanguageRawValue) ?? .system
        return language.localeOverride ?? Locale.autoupdatingCurrent
    }

    private func route(url: URL) {
        guard let route = AppRoute(url: url) else { return }
        if case .workspaceSelect = route {
            composition.clearWorkspaceSelection()
            router.popToRoot()
            return
        }
        router.navigate(to: route)
    }

    private func setupPushNotifications() {
        let pushManager = appDelegate.pushManager
        pushManager.configureRepository(deviceTokenRepository: composition.deviceTokenRepository)
        pushManager.onNotificationTap = { workspaceId, callSessionId in
            router.navigate(to: .call(workspaceId: workspaceId, callSessionId: callSessionId))
        }

        composition.authService.addAuthStateListener { isSignedIn in
            Swift.Task { @MainActor in
                if isSignedIn {
                    _ = await pushManager.requestPermission()
                    await pushManager.markAuthReady()
                } else {
                    await pushManager.markAuthSignedOut()
                }
            }
        }
    }

    private func setupCallKit() {
        let callKitManager = appDelegate.callKitManager
        let voipManager = appDelegate.voipPushManager
        voipManager.configureRepository(deviceTokenRepository: composition.deviceTokenRepository)
        LiveKitSessionManager.configureForCallKit()

        callKitManager.onAnswerCall = { workspaceId, callSessionId in
            router.deferNavigation(to: .call(workspaceId: workspaceId, callSessionId: callSessionId))
            router.flushPendingRoute()
        }

        composition.authService.addAuthStateListener { isSignedIn in
            Swift.Task { @MainActor in
                if isSignedIn {
                    await voipManager.markAuthReady()
                    voipManager.startRegistration()
                } else {
                    await voipManager.markAuthSignedOut()
                }
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    let callKitManager = CallKitManager()
    let pushManager = PushNotificationManager()
    private(set) lazy var voipPushManager = VoIPPushManager(callKitManager: callKitManager)

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        AuthService.configure()
        pushManager.configureDelegates()
        application.registerForRemoteNotifications()
        return true
    }

    func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Messaging.messaging().apnsToken = deviceToken
    }
}
