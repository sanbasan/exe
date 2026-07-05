import ExeUI
import SwiftUI

#if DEBUG
private struct AgendaDocumentRowPreviewSheet: View {
    private let rows = AgendaDocumentRowPreviewData.rows

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(rows) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.name)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        AgendaDocumentRow(row: item.row)
                    }
                }
            }
            .padding(20)
        }
        .background(ExeColors.background)
    }
}

private struct AgendaDocumentRowPreviewItem: Identifiable {
    let id: String
    let name: String
    let row: AgendaDocumentRowModel
}

private struct AgendaDocumentRowPreviewSpec {
    let detailLines: [TaskDetailLine]
    let title: String
    var diffRows: [PatchDiffRow] = []
    var isCompletion = false
}

private enum AgendaDocumentRowPreviewData {
    private static let longTitle = "Make the meeting note task card readable on narrow devices " +
        "without crowding the title or diff rows"

    static let rows: [AgendaDocumentRowPreviewItem] = [
        item(
            id: "plain",
            name: "通常",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: standardDetails(dueAt: "7/1 (水) 19:24"),
                title: "Improve focus by using push-to-talk"
            )
        ),
        item(
            id: "due",
            name: "期限変更",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: standardDetails(dueAt: "7/1 (水) 19:24"),
                title: "Improve focus by using push-to-talk",
                diffRows: [
                    PatchDiffRow(label: "期限", before: "6/30 (火) 20:00", after: "7/1 (水) 19:24")
                ]
            )
        ),
        item(
            id: "multi",
            name: "複数項目変更",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: standardDetails(dueAt: "7/2 (木) 11:00", assignees: "Sana、Ken"),
                title: "Review onboarding notification copy",
                diffRows: [
                    PatchDiffRow(label: "タイトル", before: "通知文言を確認", after: "Review onboarding notification copy"),
                    PatchDiffRow(label: "期限", before: "7/1 (水) 18:00", after: "7/2 (木) 11:00"),
                    PatchDiffRow(label: "担当", before: "Sana", after: "Sana、Ken")
                ]
            )
        ),
        item(
            id: "long",
            name: "長いテキスト",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: standardDetails(
                    dueAt: "7/4 (土) 16:00",
                    requester: "Very Long Requester Name",
                    assignees: "Sana、Ken、Another Long Assignee Name"
                ),
                title: longTitle,
                diffRows: [
                    PatchDiffRow(
                        label: "タイトル",
                        before: "会議ノートのカード表示を確認",
                        after: longTitle
                    )
                ]
            )
        ),
        item(
            id: "new",
            name: "変更前なし",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: [],
                title: "Confirm rollout owner before the next review",
                diffRows: [
                    PatchDiffRow(label: "担当", before: nil, after: "未定"),
                    PatchDiffRow(label: "期限", before: nil, after: "7/3 (金) 10:00")
                ]
            )
        ),
        item(
            id: "completed",
            name: "完了",
            spec: AgendaDocumentRowPreviewSpec(
                detailLines: standardDetails(dueAt: "6/30 (火) 17:00"),
                title: "Send the call summary to the channel",
                diffRows: [
                    PatchDiffRow(label: "ステータス", before: "対応中", after: "完了")
                ],
                isCompletion: true
            )
        )
    ]

    private static func item(
        id: String,
        name: String,
        spec: AgendaDocumentRowPreviewSpec
    ) -> AgendaDocumentRowPreviewItem {
        AgendaDocumentRowPreviewItem(
            id: id,
            name: name,
            row: AgendaDocumentRowModel(
                id: id,
                detailLines: spec.detailLines,
                title: spec.title,
                diffRows: spec.diffRows,
                isCompletion: spec.isCompletion
            )
        )
    }

    private static func standardDetails(
        dueAt: String,
        requester: String = "石川健太郎",
        assignees: String = "石川健太郎"
    ) -> [TaskDetailLine] {
        [
            TaskDetailLine(label: "Due at", value: dueAt),
            TaskDetailLine(label: "Requested by", value: requester),
            TaskDetailLine(label: "Assignees", value: assignees)
        ]
    }
}

#Preview("Agenda Card Patterns") {
    AgendaDocumentRowPreviewSheet()
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Agenda Card Narrow") {
    AgendaDocumentRowPreviewSheet()
        .frame(width: 360)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}

#Preview("Agenda Card Dark") {
    AgendaDocumentRowPreviewSheet()
        .preferredColorScheme(.dark)
        .environment(\.locale, Locale(identifier: "ja_JP"))
}
#endif
