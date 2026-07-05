import Foundation

/// Unified date/time presentation shared across Exe surfaces.
///
/// English output matches the Slack/web format exactly: `Jun 28 (Sun) 2:59 PM`
/// with no zero-padding on the day or hour.
public enum ExeDateFormatting {
    public static func parseISODate(_ isoDateTime: String) -> Date? {
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds
        ]
        if let date = withFractionalSeconds.date(from: isoDateTime) {
            return date
        }

        let withoutFractionalSeconds = ISO8601DateFormatter()
        withoutFractionalSeconds.formatOptions = [.withInternetDateTime]
        return withoutFractionalSeconds.date(from: isoDateTime)
    }

    public static func displayString(
        isoDateTime: String,
        language: Language = .preferredForAppLocalization(),
        timeZone: TimeZone = .current
    ) -> String {
        guard let date = parseISODate(isoDateTime) else {
            return isoDateTime
        }

        return displayString(date: date, language: language, timeZone: timeZone)
    }

    public static func displayString(
        date: Date,
        language: Language = .preferredForAppLocalization(),
        timeZone: TimeZone = .current
    ) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone

        switch language {
            case .en:
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.dateFormat = "MMM d (EEE) h:mm a"
            case .ja:
                formatter.locale = Locale(identifier: "ja_JP")
                formatter.dateFormat = "M/d (EEE) H:mm"
        }

        return formatter.string(from: date)
    }
}
