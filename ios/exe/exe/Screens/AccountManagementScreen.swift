import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct AccountManagementScreen: View {
    @Environment(AppComposition.self)
    var composition
    @State
    var errorMessage: String?
    @State
    var isSaving = false
    @State
    var members: [SlackWorkspaceMember] = []
    @State
    var originalAdminIds: Set<SlackUserID> = []
    @State
    var originalEditorIds: Set<SlackUserID> = []
    @State
    var selectedAdminIds: Set<SlackUserID> = []
    @State
    var selectedEditorIds: Set<SlackUserID> = []
    @State
    var userProfile: UserProfile?
    @State
    var workspace: Workspace?

    let loadsOnAppear: Bool
    let workspaceId: WorkspaceID

    init(workspaceId: WorkspaceID) {
        self.workspaceId = workspaceId
        loadsOnAppear = true
    }

    #if DEBUG
    init(
        workspaceId: WorkspaceID,
        previewState: AccountManagementPreviewState
    ) {
        let accountState = Self.accountState(
            workspace: previewState.workspace,
            userProfile: previewState.userProfile,
            workspaceId: workspaceId
        )
        self.workspaceId = workspaceId
        loadsOnAppear = false
        _errorMessage = State(initialValue: previewState.errorMessage)
        _members = State(initialValue: previewState.members)
        _originalAdminIds = State(initialValue: accountState.adminIds)
        _originalEditorIds = State(initialValue: accountState.editorIds)
        _selectedAdminIds = State(initialValue: accountState.adminIds)
        _selectedEditorIds = State(initialValue: accountState.editorIds.subtracting(accountState.adminIds))
        _userProfile = State(initialValue: previewState.userProfile)
        _workspace = State(initialValue: previewState.workspace)
    }
    #endif

    var body: some View {
        SettingsListContent {
            content
            statusSection
        }
        .navigationTitle("Account management")
        .toolbar {
            if canSaveAccounts {
                Button("Save") { saveAccounts() }
                    .disabled(isSaving || !hasChanges)
            }
        }
        .refreshable { await load() }
        .task(id: workspaceId) {
            if loadsOnAppear {
                await load()
            }
        }
    }
}

#if DEBUG
struct AccountManagementPreviewState {
    var errorMessage: String?
    var members: [SlackWorkspaceMember] = []
    var userProfile: UserProfile?
    var workspace: Workspace?
}

private extension AccountManagementScreen {
    static func accountState(
        workspace: Workspace?,
        userProfile: UserProfile?,
        workspaceId: WorkspaceID
    ) -> (adminIds: Set<SlackUserID>, editorIds: Set<SlackUserID>) {
        guard let workspace else { return ([], []) }

        var adminIds = Set(workspace.admin.slackUserIds)
        if
            let currentUserSlackId = userProfile?.slackUsers.first(where: { $0.workspaceId == workspaceId })?
                .slackUserId
        {
            adminIds.insert(currentUserSlackId)
        }

        return (
            adminIds,
            Set(workspace.channelOwnerEditors.slackUserIds)
        )
    }
}
#endif
