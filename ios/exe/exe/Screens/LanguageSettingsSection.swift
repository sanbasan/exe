import SwiftUI

enum AppLanguage: String, CaseIterable {
    case system
    case english = "en"
    case japanese = "ja"

    static let storageKey = "appLanguage"

    var localeOverride: Locale? {
        switch self {
            case .system:
                nil
            case .english, .japanese:
                Locale(identifier: rawValue)
        }
    }

    func applyToAppleLanguages() {
        switch self {
            case .system:
                UserDefaults.standard.removeObject(forKey: "AppleLanguages")
            case .english, .japanese:
                UserDefaults.standard.set([rawValue], forKey: "AppleLanguages")
        }
    }
}

struct LanguageSettingsSection: View {
    @AppStorage(AppLanguage.storageKey)
    private var appLanguageRawValue = AppLanguage.system.rawValue

    var body: some View {
        SettingsPlainSection(
            "Language",
            footer: "Overrides your device language for this app. Restart the app to apply it everywhere."
        ) {
            Picker(selection: $appLanguageRawValue) {
                Text("System")
                    .tag(AppLanguage.system.rawValue)
                Text(verbatim: "English")
                    .tag(AppLanguage.english.rawValue)
                Text(verbatim: "日本語")
                    .tag(AppLanguage.japanese.rawValue)
            } label: {
                Text("App language")
                    .font(.body.weight(.semibold))
            }
            .pickerStyle(.menu)
            .padding(.vertical, 6)
            .onChange(of: appLanguageRawValue) { _, newValue in
                (AppLanguage(rawValue: newValue) ?? .system).applyToAppleLanguages()
            }
        }
    }
}
