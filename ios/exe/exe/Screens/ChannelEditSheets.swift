import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct EditChannelAssigneesSheet: View {
    @Environment(AppComposition.self)
    private var composition
    @Environment(\.dismiss)
    private var dismiss
    @State
    private var assigneeIds: Set<SlackUserID>
    @State
    private var errorMessage: String?
    @State
    private var isSaving = false
    @State
    private var members: [SlackWorkspaceMember] = []

    let channel: Channel
    let workspaceId: WorkspaceID
    let onSubmit: (PatchChannelInput) async -> Void

    init(
        channel: Channel,
        workspaceId: WorkspaceID,
        onSubmit: @escaping (PatchChannelInput) async -> Void
    ) {
        self.channel = channel
        self.workspaceId = workspaceId
        self.onSubmit = onSubmit
        _assigneeIds = State(initialValue: Set(channel.assigneeSlackUserIds))
    }

    var body: some View {
        NavigationStack {
            SettingsListContent {
                SettingsPlainSection(
                    "Assignees",
                    footer: "Select the members responsible for checking in on this channel."
                ) {
                    MemberMultiSelect(
                        members: members,
                        selection: $assigneeIds,
                        placeholder: String(localized: "Search assignees to add")
                    )
                    .padding(.vertical, 10)
                }

                if let errorMessage {
                    InlineErrorView(errorMessage)
                }
            }
            .navigationTitle("Edit channel")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadMembers() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        Swift.Task {
                            await onSubmit(
                                PatchChannelInput(assigneeSlackUserIds: Array(assigneeIds).sorted())
                            )
                            isSaving = false
                        }
                    }
                    .disabled(isSaving)
                }
            }
        }
    }

    private func loadMembers() async {
        do {
            members = try await composition.workspaceRepository.listSlackMembers(workspaceId: workspaceId)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct EditChannelLatestInfoSheet: View {
    @Environment(\.dismiss)
    private var dismiss
    @State
    private var latestInfo: String
    @State
    private var isSaving = false

    let channel: Channel
    let onSubmit: (String) async -> Void

    init(
        channel: Channel,
        onSubmit: @escaping (String) async -> Void
    ) {
        self.channel = channel
        self.onSubmit = onSubmit
        _latestInfo = State(initialValue: channel.latestInfo ?? "")
    }

    var body: some View {
        NavigationStack {
            SettingsListContent {
                SettingsPlainSection(
                    "#\(channel.name)",
                    footer: "This appears in Slack App Home and iOS Home as the latest info."
                ) {
                    TextEditor(text: $latestInfo)
                        .frame(minHeight: 160)
                        .scrollContentBackground(.hidden)
                        .padding(.vertical, 8)
                }
            }
            .navigationTitle("Edit latest info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        Swift.Task {
                            await onSubmit(trimmedLatestInfo)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(trimmedLatestInfo.isEmpty || isSaving)
                }
            }
        }
    }

    private var trimmedLatestInfo: String {
        latestInfo.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
