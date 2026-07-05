import Foundation
import OSLog
import Sentry
import UIKit

enum Observability {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "exe",
        category: "observability"
    )
    private static var isEnabled: Bool {
        !AppRuntime.isRunningTests && !AppRuntime.isDebugBuild
    }

    static func bootstrap(bundle: Bundle = .main) {
        guard isEnabled else {
            logger.info("Observability disabled for tests or debug builds")
            return
        }

        let config = ObservabilityConfig(bundle: bundle)
        startSentry(config: config)
        addLifecycleObservers()
    }

    static func recordAppLaunchConfigured() {
        breadcrumb(category: "app.lifecycle", message: "app_launch_configured")
    }

    static func recordScenePhase(_ phase: String) {
        breadcrumb(category: "app.lifecycle", message: "scene_phase")
        SentrySDK.configureScope { scope in
            scope.setTag(value: phase, key: "scene.phase")
        }
    }

    static func capture(error: any Error, tags: [String: String] = [:]) {
        guard isEnabled else {
            return
        }

        SentrySDK.capture(error: error) { scope in
            tags.forEach { scope.setTag(value: $0.value, key: $0.key) }
        }
    }

    static func breadcrumb(category: String, level: SentryLevel = .info, message: String? = nil) {
        guard isEnabled else {
            return
        }

        let crumb = Breadcrumb(level: level, category: category)
        crumb.message = message
        SentrySDK.addBreadcrumb(crumb)
    }

    private static func startSentry(config: ObservabilityConfig) {
        guard let dsn = config.sentryDSN else {
            logger.info("Sentry disabled because SENTRY_DSN is empty")
            return
        }

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = config.environment
            options.releaseName = config.releaseName
            options.dist = config.buildNumber
            options.sendDefaultPii = true
            options.attachScreenshot = true
            options.attachViewHierarchy = true
            options.maxBreadcrumbs = 200
            options.tracesSampleRate = .init(value: config.tracesSampleRate)
            options.configureProfiling = {
                $0.sessionSampleRate = Float(config.profilesSampleRate)
                $0.lifecycle = .trace
            }
            configureSentryIntegrations(options, config: config)
        }
    }

    private static func configureSentryIntegrations(_ options: Options, config: ObservabilityConfig) {
        options.enableCrashHandler = true
        options.enableAutoSessionTracking = true
        options.enableWatchdogTerminationTracking = true
        options.enableAutoPerformanceTracing = true
        options.enableUIViewControllerTracing = true
        options.enableAppHangTracking = true
        options.enableSwizzling = true
        options.enableAutoBreadcrumbTracking = true
        options.enableNetworkBreadcrumbs = true
        options.enableNetworkTracking = true
        options.enableCaptureFailedRequests = true
        options.tracePropagationTargets = config.requestTargets
        options.failedRequestTargets = config.requestTargets
    }

    private static func addLifecycleObservers() {
        _ = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                breadcrumb(category: "device", level: .warning, message: "memory_warning")
            }
        }

        _ = NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                breadcrumb(category: "device", level: .warning, message: "thermal_state_changed")
            }
        }
    }
}

struct ObservabilityConfig {
    let sentryDSN: String?
    let tracesSampleRate: Double
    let profilesSampleRate: Double
    let environment: String
    let releaseName: String
    let buildNumber: String
    let requestTargets: [String]

    init(bundle: Bundle) {
        sentryDSN = bundle.nonEmptyString(forInfoDictionaryKey: "SENTRY_DSN")
        requestTargets = ["API_BASE_URL", "LIVEKIT_WS_URL", "UNIVERSAL_LINK_HOST"].compactMap { key in
            guard let value = bundle.nonEmptyString(forInfoDictionaryKey: key) else {
                return nil
            }
            return URL(string: value)?.host ?? value
        }
        tracesSampleRate = bundle.double(forInfoDictionaryKey: "SENTRY_TRACES_SAMPLE_RATE", defaultValue: 1.0)
        profilesSampleRate = bundle.double(forInfoDictionaryKey: "SENTRY_PROFILES_SAMPLE_RATE", defaultValue: 1.0)
        environment = bundle.bundleIdentifier?.hasSuffix(".dev") == true ? "development" : "production"
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        buildNumber = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        let bundleIdentifier = bundle.object(forInfoDictionaryKey: "CFBundleIdentifier") as? String ?? "exe"
        releaseName = "\(bundleIdentifier)@\(version)"
    }
}

enum AppRuntime {
    static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    static var isDebugBuild: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
}

private extension Bundle {
    func nonEmptyString(forInfoDictionaryKey key: String) -> String? {
        guard let value = object(forInfoDictionaryKey: key) as? String else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix("$(") else {
            return nil
        }
        return trimmed
    }

    func double(forInfoDictionaryKey key: String, defaultValue: Double) -> Double {
        guard
            let raw = object(forInfoDictionaryKey: key) as? String,
            let value = Double(raw),
            (0.0 ... 1.0).contains(value)
        else {
            return defaultValue
        }
        return value
    }
}
