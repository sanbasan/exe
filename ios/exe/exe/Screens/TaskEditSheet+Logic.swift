import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

extension TaskEditSheet {
    @ViewBuilder
    var dueTimeToggle: some View {
        Toggle("Set due time", isOn: dueTimeEnabledBinding)
            .disabled(dueDate == nil)
        if let dueTime, dueDate != nil {
            DatePicker(
                "Due time",
                selection: dueTimeBinding(default: dueTime),
                displayedComponents: .hourAndMinute
            )
            .environment(\.timeZone, timezone)
        }
    }

    var dueDateEnabledBinding: Binding<Bool> {
        Binding(
            get: { dueDate != nil },
            set: { isOn in
                dueDate = isOn ? (dueDate ?? Date()) : nil
                if !isOn {
                    dueTime = nil
                }
            }
        )
    }

    var dueTimeEnabledBinding: Binding<Bool> {
        Binding(
            get: { dueTime != nil },
            set: { isOn in
                dueTime = isOn ? (dueTime ?? dueDate ?? Date()) : nil
            }
        )
    }

    func dueDateBinding(default value: Date) -> Binding<Date> {
        Binding(
            get: { dueDate ?? value },
            set: { dueDate = $0 }
        )
    }

    func dueTimeBinding(default value: Date) -> Binding<Date> {
        Binding(
            get: { dueTime ?? value },
            set: { dueTime = $0 }
        )
    }

    var canSave: Bool {
        !trimmedTitle.isEmpty &&
            !requesterIds.isEmpty &&
            !assigneeIds.isEmpty &&
            (question.isEmpty || !trimmedQuestion.isEmpty)
    }

    var trimmedQuestion: String {
        question.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var dueAtISO: DateTime? {
        guard let dueDate else { return nil }
        var components = Calendar(identifier: .gregorian)
            .dateComponents(in: timezone, from: dueDate)
        let timeComponents = Calendar(identifier: .gregorian)
            .dateComponents(in: timezone, from: dueTime ?? dueDate)
        components.hour = dueTime == nil ? 0 : timeComponents.hour
        components.minute = dueTime == nil ? 0 : timeComponents.minute
        components.second = 0

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        guard let combinedDate = calendar.date(from: components) else {
            return nil
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: combinedDate)
    }

    func patch() -> TaskPatch {
        switch target.task {
            case let .followUp(task):
                var after = FollowUpTaskPatch()
                after.title = trimmedTitle
                after.followUpQuestion = trimmedQuestion
                after.assigneeSlackUserIds = Array(assigneeIds).sorted()
                after.requesterSlackUserIds = Array(requesterIds).sorted()
                return TaskPatch(after: .followUp(after), taskId: task.id)
            case let .work(task):
                var after = WorkTaskPatch()
                after.title = trimmedTitle
                after.assigneeSlackUserIds = Array(assigneeIds).sorted()
                after.requesterSlackUserIds = Array(requesterIds).sorted()
                if let dueAtISO {
                    after.dueAt = dueAtISO
                } else {
                    after.clearDueAt()
                }
                return TaskPatch(after: .work(after), taskId: task.id)
        }
    }

    func save() {
        isSaving = true
        Swift.Task {
            await onSubmit(patch())
            isSaving = false
            dismiss()
        }
    }

    func loadMembers() async {
        do {
            members = try await composition.workspaceRepository.listSlackMembers(workspaceId: workspaceId)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
