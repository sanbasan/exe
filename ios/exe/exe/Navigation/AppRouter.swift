import ExeDomain
import Foundation
import Observation
import SwiftUI

enum AppRoute: Hashable {
    case accountManagement(workspaceId: WorkspaceID)
    case admins(workspaceId: WorkspaceID)
    case call(workspaceId: WorkspaceID, callSessionId: String)
    case channels(workspaceId: WorkspaceID)
    case callScheduleSettings(workspaceId: WorkspaceID)
    case settings(workspaceId: WorkspaceID)
    case workspaceHome(workspaceId: WorkspaceID)
    case workspaceSelect
}

@Observable
final class AppRouter {
    var path = NavigationPath()
    private(set) var pendingRoute: AppRoute?

    func deferNavigation(to route: AppRoute) {
        pendingRoute = route
    }

    func flushPendingRoute() {
        guard let route = pendingRoute else { return }
        pendingRoute = nil
        navigate(to: route)
    }

    func navigate(to route: AppRoute) {
        path.append(route)
    }

    func popToRoot() {
        path = NavigationPath()
    }
}

extension AppRoute {
    init?(url: URL) {
        if
            url.scheme == "exe",
            let route = Self.customSchemeRoute(url: url)
        {
            self = route
            return
        }

        guard Self.isSupportedUniversalLinkHost(url.host) else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard
            parts.first == "workspaces",
            parts.count >= 2
        else { return nil }

        let workspaceId = parts[1]
        if parts.count == 4, parts[2] == "calls" {
            self = .call(workspaceId: workspaceId, callSessionId: parts[3])
        } else {
            self = .workspaceHome(workspaceId: workspaceId)
        }
    }

    private static func customSchemeRoute(url: URL) -> AppRoute? {
        if url.host == "workspace-select" {
            return .workspaceSelect
        }

        let parts = url.pathComponents.filter { $0 != "/" }
        guard
            url.host == "call",
            let callSessionId = parts.first,
            let workspaceId = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "workspaceId" })?
                .value
        else { return nil }

        return .call(workspaceId: workspaceId, callSessionId: callSessionId)
    }

    private static func isSupportedUniversalLinkHost(_ host: String?) -> Bool {
        guard let host else { return false }
        if
            let configuredHost = Bundle.main.object(forInfoDictionaryKey: "UNIVERSAL_LINK_HOST") as? String,
            !configuredHost.isEmpty,
            !configuredHost.hasPrefix("$("),
            host == configuredHost
        {
            return true
        }

        guard
            let apiBaseURLString = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let apiBaseURL = URL(string: apiBaseURLString),
            let apiHost = apiBaseURL.host
        else { return false }

        return host == apiHost
    }
}
