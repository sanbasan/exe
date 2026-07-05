import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct AdminsScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @State
    private var adminEmail = ""
    @State
    private var errorMessage: String?
    @State
    private var isSaving = false
    @State
    private var workspace: Workspace?

    let workspaceId: WorkspaceID

    var body: some View {
        SettingsListContent {
            content
            if let errorMessage {
                InlineErrorView(errorMessage)
            }
        }
        .navigationTitle("Admins")
        .refreshable { await load() }
        .task(id: workspaceId) { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if let workspace {
            if workspace.hasAdmins {
                adminListSection(workspace)

                if workspace.canManageWorkspaceSettings {
                    addAdminSection
                }
            } else {
                firstAdminSection
            }
        } else {
            ExeLoadingView(message: "Loading workspace")
                .frame(maxWidth: .infinity)
                .frame(minHeight: 180)
        }
    }

    private func adminListSection(_ workspace: Workspace) -> some View {
        SettingsPlainSection("Admins") {
            ForEach(Array(workspace.admin.emails.enumerated()), id: \.element) { index, email in
                HStack(spacing: 10) {
                    Text(email)
                        .font(.subheadline.weight(.medium))
                    Spacer(minLength: 0)
                    if workspace.canManageWorkspaceSettings {
                        Button("Remove", role: .destructive) {
                            deleteAdmin(email)
                        }
                        .font(.caption.weight(.semibold))
                        .disabled(isSaving)
                    }
                }
                .padding(.vertical, 10)

                if index < workspace.admin.emails.count - 1 {
                    Divider()
                }
            }
        }
    }

    private var addAdminSection: some View {
        SettingsPlainSection("Add admin") {
            TextField("Email", text: $adminEmail)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.vertical, 10)

            Divider()

            Button("Add admin") {
                addAdmin()
            }
            .font(.subheadline.weight(.semibold))
            .disabled(isSaving || trimmedEmail.isEmpty)
            .padding(.vertical, 10)
        }
    }

    private var firstAdminSection: some View {
        SettingsPlainSection {
            Button("Become an Administrator") {
                registerFirstAdmin()
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaving)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
    }

    private var trimmedEmail: String {
        adminEmail.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func addAdmin() {
        let email = trimmedEmail
        guard !email.isEmpty else { return }
        save {
            workspace = try await composition.workspaceRepository.addAdmin(
                workspaceId: workspaceId,
                email: email
            )
            adminEmail = ""
        }
    }

    private func deleteAdmin(_ email: String) {
        save {
            workspace = try await composition.workspaceRepository.deleteAdmin(
                workspaceId: workspaceId,
                email: email
            )
        }
    }

    private func load() async {
        do {
            let workspaces = try await composition.workspaceRepository.listWorkspaces()
            workspace = workspaces.first { $0.id == workspaceId }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func registerFirstAdmin() {
        save {
            workspace = try await composition.workspaceRepository.registerFirstAdmin(
                workspaceId: workspaceId
            )
        }
    }

    private func save(_ operation: @escaping () async throws -> Void) {
        isSaving = true
        errorMessage = nil
        Swift.Task {
            defer { isSaving = false }
            do {
                try await operation()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
