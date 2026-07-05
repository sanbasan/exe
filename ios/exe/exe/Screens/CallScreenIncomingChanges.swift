import ExeDomain
import ExeLiveKit
import ExeUI
import SwiftUI

struct IncomingChangeRow: View {
    let details: [String]
    let icon: String
    let subtitle: String?
    let title: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ExeColors.accent)
                .frame(width: 28, height: 28)
                .background(ExeColors.accentSoft, in: Circle())

            VStack(alignment: .leading, spacing: 7) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !details.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(details, id: \.self) { detail in
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Image(systemName: "arrow.turn.down.right")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(ExeColors.accent)
                                Text(detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(
            ExeColors.accent.opacity(0.06),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(ExeColors.border, lineWidth: 1)
        }
    }
}

extension CallScreen {
    func patchTitle(_ patch: TaskPatch) -> String {
        taskTitle(for: patch.taskId)
            ?? patchPayloadTitle(patch.before)
            ?? patchPayloadTitle(patch.after)
            ?? String(localized: "Update task")
    }

    func patchSubtitle(_ patch: TaskPatch) -> String {
        switch patch.after {
            case .followUp:
                String(localized: "Update follow-up request")
            case .work:
                String(localized: "Update task")
        }
    }

    func patchDetailLines(_ patch: TaskPatch) -> [String] {
        switch patch.after {
            case let .followUp(after):
                followUpPatchDetailLines(after)
            case let .work(after):
                workPatchDetailLines(after)
        }
    }

    func draftDetailLines(_ draft: FollowUpTaskDraft) -> [String] {
        var details = [String(localized: "Create follow-up request")]

        if let channelId = draft.channelId {
            details.append(String(localized: "Channel: \(channelLabel(for: channelId))"))
        }
        if let sourceTaskId = draft.sourceTaskId, let title = taskTitle(for: sourceTaskId) {
            details.append(String(localized: "Related task: \(title)"))
        }

        return details
    }

    func taskTitle(for taskId: String) -> String? {
        guard let agenda = liveKitManager.agenda else { return nil }

        if let task = agenda.workTasks.first(where: { $0.id == taskId }) {
            return task.title
        }
        if let task = agenda.followUpTasks.first(where: { $0.id == taskId }) {
            return task.title
        }

        return nil
    }

    func channelLabel(for channelId: String) -> String {
        guard
            let channel = liveKitManager.agenda?.channels.first(where: { $0.channelId == channelId })
        else { return String(localized: "Selected channel") }

        return "#\(channel.name)"
    }

    func memberLabel(for slackUserId: SlackUserID) -> String {
        members.first { $0.slackId == slackUserId }?.displayName ?? "@\(slackUserId)"
    }

    private func patchPayloadTitle(_ payload: TaskPatchPayload?) -> String? {
        guard let payload else { return nil }

        switch payload {
            case let .followUp(patch):
                return patch.title
            case let .work(patch):
                return patch.title
        }
    }

    private func followUpPatchDetailLines(_ patch: FollowUpTaskPatch) -> [String] {
        var details: [String] = []

        if let answer = patch.followUpAnswer {
            details.append(String(localized: "Answer: \(answer)"))
        }
        if let status = patch.status {
            details.append(String(localized: "Status: \(taskStatusLabel(status))"))
        }
        if let title = patch.title {
            details.append(String(localized: "Title: \(title)"))
        }
        if let question = patch.followUpQuestion {
            details.append(String(localized: "Question: \(question)"))
        }

        return details.isEmpty ? [String(localized: "Recorded a change")] : details
    }

    private func workPatchDetailLines(_ patch: WorkTaskPatch) -> [String] {
        var details: [String] = []

        if let status = patch.status {
            details.append(String(localized: "Status: \(taskStatusLabel(status))"))
        }
        if let dueAt = patch.dueAt {
            let dueAtLabel = ExeDateFormatting.displayString(
                isoDateTime: dueAt,
                language: liveKitManager.agenda?.language ?? .en
            )
            details.append(String(localized: "Due: \(dueAtLabel)"))
        }
        if let title = patch.title {
            details.append(String(localized: "Title: \(title)"))
        }

        return details.isEmpty ? [String(localized: "Recorded a change")] : details
    }

    func taskStatusLabel(_ status: TaskStatus) -> String {
        switch status {
            case .active:
                String(localized: "Mark active")
            case .blocked:
                String(localized: "Mark blocked")
            case .cancelled:
                String(localized: "Mark cancelled")
            case .completed:
                String(localized: "Mark completed")
        }
    }
}
