import ExeAPIClient
import ExeDomain
import Foundation
import Observation

@Observable
final class AppComposition: @unchecked Sendable {
    let apiClient: APIClient
    let authService: AuthService
    let callRepository: CallRepository
    let deviceTokenRepository: DeviceTokenRepository
    let liveKitTokenRepository: LiveKitTokenRepository
    let liveKitWsURL: URL
    let channelRepository: ChannelRepository
    let taskRepository: TaskRepository
    let workspaceRepository: WorkspaceRepository

    var selectedWorkspaceId: WorkspaceID? {
        didSet {
            UserDefaults.standard.set(selectedWorkspaceId, forKey: selectedWorkspaceKey)
        }
    }

    private let selectedWorkspaceKey = "exe.selectedWorkspaceId"

    init(
        baseURL: URL,
        liveKitWsURL: URL
    ) {
        let auth = AuthService(baseURL: baseURL)
        let api = APIClient(baseURL: baseURL, authProvider: auth)
        self.apiClient = api
        self.authService = auth
        self.callRepository = CallRepository(apiClient: api)
        self.deviceTokenRepository = DeviceTokenRepository(apiClient: api)
        self.liveKitTokenRepository = LiveKitTokenRepository(apiClient: api)
        self.liveKitWsURL = liveKitWsURL
        self.channelRepository = ChannelRepository(apiClient: api)
        self.taskRepository = TaskRepository(apiClient: api)
        self.workspaceRepository = WorkspaceRepository(apiClient: api)
        self.selectedWorkspaceId = UserDefaults.standard.string(forKey: selectedWorkspaceKey)
    }

    func clearWorkspaceSelection() {
        selectedWorkspaceId = nil
    }

    func selectWorkspace(_ workspace: Workspace) {
        selectedWorkspaceId = workspace.id
    }
}

extension AppComposition {
    static let live = AppComposition(
        baseURL: Bundle.main.requiredURL(forInfoDictionaryKey: "API_BASE_URL"),
        liveKitWsURL: Bundle.main.requiredURL(forInfoDictionaryKey: "LIVEKIT_WS_URL")
    )
}

private extension Bundle {
    func requiredURL(forInfoDictionaryKey key: String) -> URL {
        guard
            let value = object(forInfoDictionaryKey: key) as? String,
            let url = URL(string: value)
        else {
            fatalError("\(key) is not set in Info.plist / xcconfig")
        }
        return url
    }
}
