import SwiftUI

public struct InlineErrorView: View {
    private let message: String

    public init(_ message: String) {
        self.message = message
    }

    public var body: some View {
        Label(message, systemImage: "exclamationmark.triangle")
            .font(.footnote)
            .foregroundStyle(ExeColors.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(ExeColors.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
    }
}

public struct EmptyStateView: View {
    private let message: LocalizedStringKey
    private let systemImage: String
    private let title: LocalizedStringKey

    public init(
        _ title: LocalizedStringKey,
        systemImage: String,
        message: LocalizedStringKey
    ) {
        self.message = message
        self.systemImage = systemImage
        self.title = title
    }

    public var body: some View {
        ContentUnavailableView(
            title,
            systemImage: systemImage,
            description: Text(message)
        )
    }
}
