import SwiftUI

public struct ExeLoadingView: View {
    private let message: LocalizedStringKey?

    public init(message: LocalizedStringKey? = nil) {
        self.message = message
    }

    public var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.regular)
            if let message {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
