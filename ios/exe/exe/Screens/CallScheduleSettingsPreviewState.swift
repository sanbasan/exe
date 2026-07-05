import ExeAPIClient
import ExeDomain
import Foundation

#if DEBUG
struct CallScheduleSettingsPreviewState {
    var errorMessage: String?
    var savedMessage: String?
    var schedule: CallSchedule?
}

extension CallScheduleSettingsScreen {
    static func previewInput(from schedule: CallSchedule) -> PutCallScheduleInput {
        var input = PutCallScheduleInput()
        input.enabled = schedule.enabled
        input.excludedDates = schedule.excludedDates
        input.preNotifyMinutes = schedule.preNotifyMinutes
        input.timeOfDay = schedule.timeOfDay
        input.timezone = schedule.timezone
        input.weekdays = schedule.weekdays
        return input
    }
}
#endif

extension CallScheduleSettingsScreen {
    static func date(from timeOfDay: String) -> Date {
        let values = timeOfDay.split(separator: ":").compactMap { Int($0) }
        guard values.count == 2 else {
            return Date()
        }

        return Calendar.current.date(
            from: DateComponents(hour: values[0], minute: values[1])
        ) ?? Date()
    }

    static func dateComponents(from dateOnly: DateOnly) -> DateComponents? {
        let values = dateOnly.split(separator: "-").compactMap { Int($0) }
        guard values.count == 3 else {
            return nil
        }

        return DateComponents(
            calendar: Calendar(identifier: .gregorian),
            timeZone: TimeZone(secondsFromGMT: 0),
            year: values[0],
            month: values[1],
            day: values[2]
        )
    }

    static func dateOnlyString(from components: DateComponents) -> String? {
        guard
            let year = components.year,
            let month = components.month,
            let day = components.day
        else {
            return nil
        }

        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func timeString(from date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0

        return String(format: "%02d:%02d", hour, minute)
    }
}
