import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct TaskActionTarget: Identifiable {
    let task: ExeDomain.Task

    var id: String {
        task.id
    }

    var isOpen: Bool {
        switch task.status {
            case .active, .blocked:
                true
            case .cancelled, .completed:
                false
        }
    }
}

struct TaskEditTarget: Identifiable {
    let task: ExeDomain.Task

    var id: String {
        task.id
    }
}
