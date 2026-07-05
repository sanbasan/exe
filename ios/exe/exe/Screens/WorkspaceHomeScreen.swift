import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct WorkspaceHomeScreen: View {
    @Environment(AppComposition.self)
    var composition
    @Environment(AppRouter.self)
    var router
    @State
    var blockToDelete: ChannelBlock?
    @State
    var blockToEdit: ChannelBlock?
    @State
    var channelLatestInfoToEdit: Channel?
    @State
    var channelToArchive: ChannelActionTarget?
    @State
    var channelToEdit: Channel?
    @State
    var editingTask: TaskEditTarget?
    @State
    var errorMessage: String?
    @State
    var isSavingBlockId: String?
    @State
    var isSavingChannelId: SlackChannelID?
    @State
    var isSavingTaskId: String?
    @State
    var isStartingCall = false
    @State
    var members: [SlackWorkspaceMember] = []
    @State
    var snapshot: HomeSnapshot?

    let workspaceId: WorkspaceID

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if let errorMessage {
                    InlineErrorView(errorMessage)
                }

                bodyContent
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 12)
        }
        .background(ExeColors.background.ignoresSafeArea())
        .tint(ExeColors.accent)
        .navigationTitle(snapshot?.workspace.name ?? "exe")
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    router.navigate(to: .settings(workspaceId: workspaceId))
                } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let snapshot, snapshot.workspace.hasAdmins {
                FloatingCallControl(
                    isScheduledDefault: snapshot.shouldDefaultManualStartToScheduledRun,
                    isStarting: isStartingCall,
                    onStart: startManualCall(mode:)
                )
            }
        }
        .sheet(item: $editingTask) { target in
            TaskEditSheet(
                target: target,
                workspaceId: workspaceId,
                members: members,
                timezone: snapshot.map { TimeZone(identifier: $0.schedule.timezone) ?? .current } ?? .current
            ) { patch in
                await submitTaskPatch(patch)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $channelToEdit) { channel in
            EditChannelAssigneesSheet(channel: channel, workspaceId: workspaceId) { input in
                await submitChannelMetadata(channel: channel, input: input)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $channelLatestInfoToEdit) { channel in
            EditChannelLatestInfoSheet(channel: channel) { latestInfo in
                await submitChannelMetadata(
                    channel: channel,
                    input: PatchChannelInput(latestInfo: latestInfo)
                )
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $channelToArchive) { target in
            ChannelArchiveSheet(
                isSaving: isSavingChannelId == target.id,
                onArchive: {
                    updateChannel(
                        target.channel,
                        input: PatchChannelInput(status: .archived)
                    )
                },
                target: target
            )
            .presentationDetents([.height(260), .medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $blockToEdit) { block in
            EditChannelBlockSheet(block: block) { title, description in
                await updateBlock(block, title: title, description: description)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Delete block",
            isPresented: isDeleteBlockDialogPresented,
            titleVisibility: .visible,
            presenting: blockToDelete
        ) { block in
            Button("Delete", role: .destructive) {
                deleteBlock(block)
            }
        } message: { block in
            Text("Delete \"\(block.title)\"? This can't be undone.")
        }
        .refreshable { await load() }
        .task(id: workspaceId) { await load() }
    }

    private var isDeleteBlockDialogPresented: Binding<Bool> {
        Binding(
            get: { blockToDelete != nil },
            set: { isPresented in
                if !isPresented {
                    blockToDelete = nil
                }
            }
        )
    }

    @ViewBuilder
    private var bodyContent: some View {
        if let snapshot {
            if snapshot.workspace.hasAdmins {
                homeContent(snapshot)
            } else {
                adminSetupSection
            }
        } else {
            ExeLoadingView(message: "Loading workspace")
                .frame(maxWidth: .infinity)
                .frame(minHeight: 260)
        }
    }
}
