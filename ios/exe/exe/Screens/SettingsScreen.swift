import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct SettingsScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @Environment(AppRouter.self)
    private var router
    @State
    private var errorMessage: String?
    @State
    private var isShowingWorkspaceSwitchConfirmation = false
    @State
    private var slackTeam: SlackWorkspaceTeam?
    @State
    private var workspace: Workspace?

    private let loadsOnAppear: Bool
    let workspaceId: WorkspaceID

    init(workspaceId: WorkspaceID) {
        self.workspaceId = workspaceId
        loadsOnAppear = true
    }

    #if DEBUG
    init(
        workspaceId: WorkspaceID,
        previewState: SettingsScreenPreviewState,
        showsWorkspaceSwitchConfirmation: Bool = false
    ) {
        self.workspaceId = workspaceId
        loadsOnAppear = false
        _errorMessage = State(initialValue: previewState.errorMessage)
        _isShowingWorkspaceSwitchConfirmation = State(initialValue: showsWorkspaceSwitchConfirmation)
        _slackTeam = State(initialValue: previewState.slackTeam)
        _workspace = State(initialValue: previewState.workspace)
    }
    #endif

    var body: some View {
        SettingsListContent {
            workspaceHeaderSection
            availableSettingsSection
            channelSettingsSection
            workspaceSettingsSection
            LanguageSettingsSection()
            workspaceSelectionSection
            statusSection
        }
        .navigationTitle("Settings")
        .refreshable { await load() }
        .task(id: workspaceId) {
            if loadsOnAppear {
                await load()
            }
        }
        .alert(
            "Switch workspace?",
            isPresented: $isShowingWorkspaceSwitchConfirmation
        ) {
            Button("Switch", role: .destructive) {
                switchWorkspace()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You'll leave the current workspace. You won't be logged out of your account.")
        }
    }

    @ViewBuilder
    private var availableSettingsSection: some View {
        if workspace?.canManageWorkspaceSettings == true {
            SettingsPlainSection("Schedule") {
                NavigationLink(value: AppRoute.callScheduleSettings(workspaceId: workspaceId)) {
                    SettingsNavigationRow(
                        "Call schedule",
                        systemImage: "calendar.badge.clock",
                        subtitle: "Weekdays, time, and skip dates for regular calls"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var canOpenAccountManagement: Bool {
        guard let workspace else { return false }
        return !workspace.hasAdmins || workspace.canManageWorkspaceSettings
    }

    private var channelSettingsSection: some View {
        SettingsPlainSection("Channels") {
            NavigationLink(value: AppRoute.channels(workspaceId: workspaceId)) {
                SettingsNavigationRow(
                    "Channels to review",
                    systemImage: "checklist",
                    subtitle: "Channels shown in Home and review calls even if you're not the owner"
                )
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        if let errorMessage {
            InlineErrorView(errorMessage)
        }
    }

    private var workspaceHeaderSection: some View {
        SettingsPlainSection("Workspace") {
            if let workspace {
                HStack(spacing: 14) {
                    WorkspaceIconView(
                        name: workspace.name,
                        url: slackTeam?.iconURL
                    )
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Selected workspace")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(workspace.name)
                            .font(.headline)
                        Text(workspace.slackTeamId)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)
            } else {
                ExeLoadingView(message: "Loading workspace")
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 80)
            }
        }
    }

    @ViewBuilder
    private var workspaceSettingsSection: some View {
        if canOpenAccountManagement {
            SettingsPlainSection("Permissions") {
                NavigationLink(value: AppRoute.accountManagement(workspaceId: workspaceId)) {
                    SettingsNavigationRow(
                        "Account management",
                        systemImage: "person.2.badge.gearshape",
                        subtitle: "Edit permissions for admins and channel owners"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var workspaceSelectionSection: some View {
        SettingsPlainSection(
            footer: "You'll leave the current workspace and choose again. You won't be logged out of your account."
        ) {
            Button(role: .destructive) {
                isShowingWorkspaceSwitchConfirmation = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 22)
                    Text("Back to workspace selection")
                        .font(.body.weight(.semibold))
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func load() async {
        do {
            async let loadedWorkspaces = composition.workspaceRepository.listWorkspaces()
            async let loadedSlackTeam = composition.workspaceRepository.getSlackTeam(workspaceId: workspaceId)
            let (workspaces, slackTeam) = try await (loadedWorkspaces, loadedSlackTeam)
            workspace = workspaces.first { $0.id == workspaceId }
            self.slackTeam = slackTeam
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func switchWorkspace() {
        composition.clearWorkspaceSelection()
        router.popToRoot()
    }
}

#if DEBUG
struct SettingsScreenPreviewState {
    var errorMessage: String?
    var slackTeam: SlackWorkspaceTeam?
    var workspace: Workspace?
}
#endif

private struct WorkspaceIconView: View {
    let name: String
    let url: URL?

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                        case let .success(image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .empty:
                            ProgressView()
                        case .failure:
                            fallback
                        @unknown default:
                            fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: 44, height: 44)
        .background(ExeColors.accentSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(.quaternary, lineWidth: 1)
        }
    }

    private var fallback: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.title2.weight(.bold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ExeColors.accentSoft)
    }
}
