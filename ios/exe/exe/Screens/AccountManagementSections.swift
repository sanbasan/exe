import ExeDomain
import ExeUI
import SwiftUI

extension AccountManagementScreen {
    var adminSelectionBinding: Binding<Set<SlackUserID>> {
        Binding(
            get: { selectedAdminIds },
            set: { newValue in
                var admins = newValue
                if let currentUserSlackId {
                    admins.insert(currentUserSlackId)
                }
                selectedAdminIds = admins
                // 管理者になった人は編集者選択から外す（管理者は常に編集可能）。
                selectedEditorIds.subtract(admins)
            }
        )
    }

    var editorSelectionBinding: Binding<Set<SlackUserID>> {
        Binding(
            get: { selectedEditorIds },
            set: { newValue in
                selectedEditorIds = newValue.subtracting(selectedAdminIds)
            }
        )
    }

    @ViewBuilder
    var content: some View {
        if let workspace {
            if !workspace.hasAdmins {
                firstAdminSection
            } else if workspace.canManageWorkspaceSettings {
                accountCandidateSections
            } else {
                permissionDeniedSection
            }
        } else {
            ExeLoadingView(message: "Loading account")
        }
    }

    var accountCandidateSections: some View {
        Group {
            adminSection
            channelOwnerEditorSection
        }
    }

    var adminSection: some View {
        SettingsPlainSection("Admins") {
            MemberMultiSelect(
                members: members,
                selection: adminSelectionBinding,
                lockedIds: currentUserSlackId.map { [$0] } ?? [],
                currentUserId: currentUserSlackId,
                placeholder: String(localized: "Search admins to add")
            )
            .padding(.vertical, 10)
        }
    }

    var canSaveAccounts: Bool {
        workspace?.canManageWorkspaceSettings == true
    }

    var channelOwnerEditorSection: some View {
        SettingsPlainSection("Channel owners") {
            MemberMultiSelect(
                members: members,
                selection: editorSelectionBinding,
                disabledIds: selectedAdminIds,
                currentUserId: currentUserSlackId,
                placeholder: String(localized: "Search channel owners to add")
            )
            .padding(.vertical, 10)
        }
    }

    var currentUserSlackId: SlackUserID? {
        userProfile?.slackUsers.first { $0.workspaceId == workspaceId }?.slackUserId
    }

    var firstAdminSection: some View {
        SettingsPlainSection {
            Text(
                "This workspace doesn't have any admins yet. Set up the first admin to get started."
            )
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
            Button {
                registerFirstAdmin()
            } label: {
                Label("Become the first admin", systemImage: "person.badge.shield.checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaving)
            .padding(.bottom, 10)
        }
    }

    var hasChanges: Bool {
        selectedAdminIds != originalAdminIds || selectedEditorIds != originalEditorIds
    }

    var permissionDeniedSection: some View {
        SettingsPlainSection {
            ContentUnavailableView(
                "No permission",
                systemImage: "lock",
                description: Text("Account management is only available to workspace admins.")
            )
            .frame(maxWidth: .infinity)
            .frame(minHeight: 220)
        }
    }

    @ViewBuilder
    var statusSection: some View {
        if let errorMessage {
            InlineErrorView(errorMessage)
        }
    }
}
