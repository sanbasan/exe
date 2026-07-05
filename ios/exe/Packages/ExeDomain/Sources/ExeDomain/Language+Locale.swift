import Foundation

public extension Language {
    static func preferredForAppLocalization(
        preferredLocalizationIdentifiers: [String] = Bundle.main.preferredLocalizations,
        localeIdentifier: String = Locale.autoupdatingCurrent.identifier,
        preferredLanguageIdentifiers: [String] = Locale.preferredLanguages
    ) -> Self {
        let identifiers = preferredLocalizationIdentifiers + preferredLanguageIdentifiers + [localeIdentifier]

        return identifiers
            .lazy
            .compactMap(languageCode)
            .compactMap(Self.init(languageCode:))
            .first ?? .en
    }

    private init?(languageCode: String) {
        switch languageCode {
            case "en":
                self = .en
            case "ja":
                self = .ja
            default:
                return nil
        }
    }

    private static func languageCode(from identifier: String) -> String? {
        let normalized = identifier
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
        let code = normalized.split(
            whereSeparator: { character in
                character == "-" || character == "@" || character == "."
            }
        ).first.map(String.init)

        return code?.isEmpty == false ? code : nil
    }
}
