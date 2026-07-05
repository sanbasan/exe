import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

#if DEBUG
private struct WorkspaceHomePreviewSurface: View {
    let snapshot: HomeSnapshot
    var showsError = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if showsError {
                        InlineErrorView("最新データの取得に失敗しました。表示中の内容は前回取得した情報です。")
                    }

                    if snapshot.workspace.hasAdmins {
                        homeContent
                    } else {
                        adminSetupSection
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 12)
            }
            .background(ExeColors.background.ignoresSafeArea())
            .tint(ExeColors.accent)
            .navigationTitle(snapshot.workspace.name)
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {} label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if snapshot.workspace.hasAdmins {
                    FloatingCallControl(
                        isScheduledDefault: snapshot.shouldDefaultManualStartToScheduledRun,
                        isStarting: false,
                        onStart: { _ in }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var homeContent: some View {
        WorkspaceHomeScheduleRow(snapshot: snapshot) {}

        let channels = snapshot.visibleHomeChannels
        if channels.isEmpty {
            WorkspaceHomeEmptyChannelsNotice()
        } else {
            WorkspaceHomeChannelList(
                channels: channels,
                isSavingBlockId: nil,
                isSavingChannelId: nil,
                isSavingTaskId: nil,
                members: [],
                snapshot: snapshot,
                onArchive: { _ in },
                onCancelTask: { _ in },
                onCompleteTask: { _ in },
                onEditAssignees: { _ in },
                onEditLatestInfo: { _ in },
                onEditTask: { _ in },
                onReactivate: { _ in },
                onReopenTask: { _ in },
                onDeleteBlock: { _ in },
                onEditBlock: { _ in },
                onResolveBlock: { _ in }
            )
        }
    }

    private var adminSetupSection: some View {
        HomeSection("ワークスペース設定", systemImage: "person.badge.shield.checkmark") {
            VStack(alignment: .leading, spacing: 12) {
                Text("最初の管理者を設定してください。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button {} label: {
                    Label("設定を開く", systemImage: "arrow.right.circle.fill")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.vertical, 8)
        }
    }
}

#Preview("Home Loaded") {
    WorkspaceHomePreviewSurface(snapshot: WorkspaceHomePreviewData.loaded)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Home Empty") {
    WorkspaceHomePreviewSurface(snapshot: WorkspaceHomePreviewData.empty)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Home Setup Required") {
    WorkspaceHomePreviewSurface(snapshot: WorkspaceHomePreviewData.setupRequired)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Home Narrow") {
    WorkspaceHomePreviewSurface(snapshot: WorkspaceHomePreviewData.loaded)
        .frame(width: 390, height: 844)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
