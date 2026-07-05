import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct WorkspaceSelectScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @Environment(AppRouter.self)
    private var router
    @State
    private var errorMessage: String?
    @State
    private var isSigningOut = false

    let workspaces: [Workspace]

    var body: some View {
        List {
            if let errorMessage {
                InlineErrorView(errorMessage)
            }

            if workspaces.isEmpty {
                emptySection
            } else {
                workspaceSection
            }

            signOutSection
        }
        .scrollContentBackground(.hidden)
        .background(ExeColors.background.ignoresSafeArea())
        .navigationTitle("Select workspace")
    }

    private var emptySection: some View {
        Section {
            ContentUnavailableView(
                "No workspaces",
                systemImage: "building.2",
                description: Text("Install exe in Slack with the same email address.")
            )
        }
    }

    private var signOutSection: some View {
        Section("Account") {
            Button("Log out", role: .destructive) {
                signOut()
            }
            .disabled(isSigningOut)
        }
    }

    private var workspaceSection: some View {
        Section {
            ForEach(workspaces) { workspace in
                Button {
                    composition.selectWorkspace(workspace)
                    router.popToRoot()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(workspace.name)
                            .font(.headline)
                        Text(workspace.slackTeamId)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } header: {
            Text("Workspace")
        } footer: {
            Text("If a workspace you just added exe to in Slack doesn't appear here, log out and log back in.")
        }
    }

    private func signOut() {
        errorMessage = nil
        isSigningOut = true
        Swift.Task {
            defer { isSigningOut = false }
            do {
                composition.clearWorkspaceSelection()
                try await composition.authService.signOut()
                router.popToRoot()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
