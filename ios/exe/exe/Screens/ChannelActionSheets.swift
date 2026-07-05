import ExeDomain
import SwiftUI

struct ChannelActionTarget: Identifiable {
    let channel: Channel

    var id: SlackChannelID {
        channel.id
    }
}

struct ChannelArchiveSheet: View {
    let isSaving: Bool
    let onArchive: () -> Void
    let target: ChannelActionTarget

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Archive #\(target.channel.name)?")
                    .font(.title3.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)

                Text("This channel will be removed from the regular list. You can reopen it anytime.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Button(role: .destructive, action: onArchive) {
                    Label("Archive channel", systemImage: "archivebox")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSaving)

                Spacer(minLength: 0)
            }
            .padding(20)
            .navigationTitle("Confirm")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
