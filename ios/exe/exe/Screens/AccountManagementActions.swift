import ExeAPIClient
import ExeDomain
import Foundation

extension AccountManagementScreen {
    func applyWorkspace(_ workspace: Workspace) {
        self.workspace = workspace
        originalAdminIds = Set(workspace.admin.slackUserIds)
        originalEditorIds = Set(workspace.channelOwnerEditors.slackUserIds)
        selectedAdminIds = originalAdminIds
        selectedEditorIds = originalEditorIds.subtracting(originalAdminIds)
        if let currentUserSlackId {
            selectedAdminIds.insert(currentUserSlackId)
            originalAdminIds.insert(currentUserSlackId)
        }
    }

    func load() async {
        do {
            async let loadedUserProfile = composition.workspaceRepository.getMe()
            async let loadedWorkspaces = composition.workspaceRepository.listWorkspaces()
            let (userProfile, workspaces) = try await (loadedUserProfile, loadedWorkspaces)
            self.userProfile = userProfile
            guard let loadedWorkspace = workspaces.first(where: { $0.id == workspaceId }) else {
                workspace = nil
                members = []
                errorMessage = "Workspace was not found."
                return
            }
            applyWorkspace(loadedWorkspace)
            if loadedWorkspace.canManageWorkspaceSettings {
                members = try await composition.workspaceRepository.listSlackMembers(workspaceId: workspaceId)
            } else {
                members = []
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func registerFirstAdmin() {
        isSaving = true
        errorMessage = nil
        Swift.Task {
            defer { isSaving = false }
            do {
                let updated = try await composition.workspaceRepository.registerFirstAdmin(
                    workspaceId: workspaceId
                )
                applyWorkspace(updated)
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func saveAccounts() {
        isSaving = true
        errorMessage = nil
        Swift.Task {
            defer { isSaving = false }
            do {
                let updated = try await composition.workspaceRepository.putAccounts(
                    workspaceId: workspaceId,
                    input: WorkspaceAccountsInput(
                        adminSlackUserIds: Array(selectedAdminIds).sorted(),
                        channelOwnerEditorSlackUserIds: Array(
                            selectedEditorIds.subtracting(selectedAdminIds)
                        ).sorted()
                    )
                )
                applyWorkspace(updated)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
