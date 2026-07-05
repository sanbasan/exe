import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct WorkspaceGateScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @State
    private var phase: Phase = .loading

    enum Phase {
        case error(String)
        case loaded([Workspace])
        case loading
    }

    var body: some View {
        Group {
            switch phase {
                case .loading:
                    ExeLoadingView(message: "Loading workspaces")
                case let .error(message):
                    InlineErrorView(message)
                        .padding()
                case let .loaded(workspaces):
                    loadedContent(workspaces: workspaces)
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private func loadedContent(workspaces: [Workspace]) -> some View {
        if
            let selectedWorkspaceId = composition.selectedWorkspaceId,
            workspaces.contains(where: { $0.id == selectedWorkspaceId })
        {
            WorkspaceHomeScreen(workspaceId: selectedWorkspaceId)
        } else {
            WorkspaceSelectScreen(workspaces: workspaces)
        }
    }

    private func load() async {
        do {
            phase = try await .loaded(composition.workspaceRepository.listWorkspaces())
        } catch {
            phase = .error(error.localizedDescription)
        }
    }
}
