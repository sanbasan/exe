import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct CreateChannelBlockSheet: View {
    @Environment(\.dismiss)
    private var dismiss
    @State
    private var description = ""
    @State
    private var isSaving = false
    @State
    private var title = ""

    let channel: Channel
    let onSubmit: (String, String?) async -> Void

    var body: some View {
        NavigationStack {
            SettingsListContent {
                SettingsPlainSection(
                    "#\(channel.name)",
                    footer: "Add a block for anything holding up progress or needing confirmation."
                ) {
                    TextField("Title", text: $title, axis: .vertical)
                        .lineLimit(1 ... 3)
                        .padding(.vertical, 10)

                    Divider()

                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2 ... 6)
                        .padding(.vertical, 10)
                }
            }
            .navigationTitle("Add block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        isSaving = true
                        Swift.Task {
                            await onSubmit(trimmedTitle, trimmedDescription)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(trimmedTitle.isEmpty || isSaving)
                }
            }
        }
    }

    private var trimmedDescription: String? {
        let value = description.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct EditChannelBlockSheet: View {
    @Environment(\.dismiss)
    private var dismiss
    @State
    private var description: String
    @State
    private var isSaving = false
    @State
    private var title: String

    let block: ChannelBlock
    let onSubmit: (String, String?) async -> Void

    init(
        block: ChannelBlock,
        onSubmit: @escaping (String, String?) async -> Void
    ) {
        self.block = block
        self.onSubmit = onSubmit
        _title = State(initialValue: block.title)
        _description = State(
            initialValue: block.description == block.title ? "" : block.description
        )
    }

    var body: some View {
        NavigationStack {
            SettingsListContent {
                SettingsPlainSection(
                    "Block",
                    footer: "Edit the details of something that's holding up progress or needs confirmation."
                ) {
                    TextField("Title", text: $title, axis: .vertical)
                        .lineLimit(1 ... 3)
                        .padding(.vertical, 10)

                    Divider()

                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2 ... 6)
                        .padding(.vertical, 10)
                }
            }
            .navigationTitle("Edit block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        Swift.Task {
                            await onSubmit(trimmedTitle, trimmedDescription)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(trimmedTitle.isEmpty || isSaving)
                }
            }
        }
    }

    private var trimmedDescription: String? {
        let value = description.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
