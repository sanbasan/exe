import ExeDomain
import SwiftUI

public struct TaskStatusBadge: View {
    private let status: TaskStatus

    public init(status: TaskStatus) {
        self.status = status
    }

    public var body: some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: .capsule)
    }

    private var color: Color {
        switch status {
            case .active:
                ExeColors.accent
            case .blocked:
                ExeColors.warning
            case .cancelled:
                .secondary
            case .completed:
                ExeColors.success
        }
    }

    private var label: LocalizedStringKey {
        switch status {
            case .active:
                "Active"
            case .blocked:
                "Blocked"
            case .cancelled:
                "Cancelled"
            case .completed:
                "Done"
        }
    }
}

public struct CallStatusBadge: View {
    private let status: CallStatus

    public init(status: CallStatus) {
        self.status = status
    }

    public var body: some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: .capsule)
    }

    private var color: Color {
        switch status {
            case .active:
                ExeColors.success
            case .created, .ringing:
                ExeColors.warning
            case .ended:
                ExeColors.accent
            case .failed, .missed:
                ExeColors.danger
            case .skipped:
                .secondary
        }
    }

    private var label: LocalizedStringKey {
        switch status {
            case .active:
                "Active"
            case .created:
                "Created"
            case .ended:
                "Ended"
            case .failed:
                "Failed"
            case .missed:
                "Missed"
            case .ringing:
                "Ringing"
            case .skipped:
                "Skipped"
        }
    }
}
