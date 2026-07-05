import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct TaskEditSheet: View {
    @Environment(AppComposition.self)
    var composition
    @Environment(\.dismiss)
    var dismiss
    @State
    var isSaving = false
    @State
    var assigneeIds: Set<SlackUserID>
    @State
    var requesterIds: Set<SlackUserID>
    @State
    var dueDate: Date?
    @State
    var dueTime: Date?
    @State
    var question: String
    @State
    var title: String
    @State
    var members: [SlackWorkspaceMember]
    @State
    var errorMessage: String?

    let onSubmit: (TaskPatch) async -> Void
    let target: TaskEditTarget
    let timezone: TimeZone
    let workspaceId: WorkspaceID

    init(
        target: TaskEditTarget,
        workspaceId: WorkspaceID,
        members: [SlackWorkspaceMember],
        timezone: TimeZone,
        onSubmit: @escaping (TaskPatch) async -> Void
    ) {
        self.target = target
        self.workspaceId = workspaceId
        _members = State(initialValue: members)
        self.timezone = timezone
        self.onSubmit = onSubmit

        switch target.task {
            case let .followUp(task):
                _assigneeIds = State(initialValue: Set(task.assigneeSlackUserIds))
                _requesterIds = State(initialValue: Set(task.requesterSlackUserIds))
                _dueDate = State(initialValue: nil)
                _dueTime = State(initialValue: nil)
                _question = State(initialValue: task.followUpQuestion)
                _title = State(initialValue: task.title)
            case let .work(task):
                let parsedDueAt = task.dueAt.flatMap(ExeDateFormatting.parseISODate)
                _assigneeIds = State(initialValue: Set(task.assigneeSlackUserIds))
                _requesterIds = State(initialValue: Set(task.requesterSlackUserIds))
                _dueDate = State(initialValue: parsedDueAt)
                _dueTime = State(initialValue: parsedDueAt)
                _question = State(initialValue: "")
                _title = State(initialValue: task.title)
        }
    }

    private var isWorkTask: Bool {
        if case .work = target.task { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage {
                    InlineErrorView(errorMessage)
                }

                Section("Content") {
                    TextField("Content", text: $title, axis: .vertical)
                        .lineLimit(1 ... 4)
                }

                if case .followUp = target.task {
                    Section("Follow-up details") {
                        TextField("Question", text: $question, axis: .vertical)
                            .lineLimit(2 ... 6)
                    }
                }

                Section {
                    MemberMultiSelect(
                        members: members,
                        selection: $requesterIds,
                        placeholder: String(localized: "Search requesters to add")
                    )
                    .listRowSeparator(.hidden)
                } header: {
                    Text("Requester")
                }

                Section {
                    MemberMultiSelect(
                        members: members,
                        selection: $assigneeIds,
                        placeholder: String(localized: "Search assignees to add")
                    )
                    .listRowSeparator(.hidden)
                } header: {
                    Text("Assignee")
                }

                if isWorkTask {
                    Section {
                        dueDateToggle
                    } header: {
                        Text("Due date")
                    }

                    Section {
                        dueTimeToggle
                    } header: {
                        Text("Due time")
                    } footer: {
                        Text("Timezone: \(timezone.identifier)")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(ExeColors.background.ignoresSafeArea())
            .navigationTitle("Edit task")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadMembers() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(!canSave || isSaving)
                }
            }
        }
    }

    @ViewBuilder
    var dueDateToggle: some View {
        Toggle("Set due date", isOn: dueDateEnabledBinding)
        if let dueDate {
            DatePicker(
                "Due date",
                selection: dueDateBinding(default: dueDate),
                displayedComponents: .date
            )
            .environment(\.timeZone, timezone)
        }
    }
}
