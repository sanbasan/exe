import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

private let callScheduleWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

struct CallScheduleSettingsScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @State
    private var errorMessage: String?
    @State
    private var input = PutCallScheduleInput()
    @State
    private var isSaving: Bool = false
    @State
    private var savedMessage: String?
    @State
    private var skippedDateComponents: Set<DateComponents> = []
    @State
    private var timeSelection = Date()

    private let loadsOnAppear: Bool
    let workspaceId: WorkspaceID

    init(workspaceId: WorkspaceID) {
        self.workspaceId = workspaceId
        loadsOnAppear = true
    }

    var body: some View {
        SettingsListContent {
            regularCallSection
            skippedDatesSection
            statusSection
        }
        .navigationTitle("Call schedule")
        .toolbar {
            Button("Save") {
                save()
            }
            .disabled(isSaving)
        }
        .task(id: workspaceId) {
            if loadsOnAppear {
                await load()
            }
        }
    }

    private var regularCallSection: some View {
        SettingsPlainSection("Schedule") {
            Toggle(isOn: $input.enabled) {
                Label("Enabled", systemImage: "checkmark.circle")
            }
            .padding(.vertical, 10)

            Divider()

            DatePicker(
                selection: $timeSelection,
                displayedComponents: .hourAndMinute
            ) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("Time")
                    Text(input.timezone)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 10)

            Divider()

            Stepper(
                String(localized: "Notify \(input.preNotifyMinutes) min before"),
                value: $input.preNotifyMinutes,
                in: 0 ... 60
            )
            .padding(.vertical, 10)

            Divider()

            weekdayPicker
        }
    }

    private var skippedDatesSection: some View {
        SettingsPlainSection("Skip dates") {
            DisclosureGroup {
                MultiDatePicker("Skip calls on these dates", selection: $skippedDateComponents)
                    .padding(.top, 8)
            } label: {
                Label("Select dates", systemImage: "calendar")
                    .font(.body.weight(.semibold))
            }
            .padding(.vertical, 10)

            if skippedDateStrings.isEmpty {
                Divider()
                Text("No skip dates")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 10)
            } else {
                Divider()
                ForEach(skippedDateStrings, id: \.self) { date in
                    Text(date)
                        .font(.subheadline)
                        .padding(.vertical, 8)
                    if date != skippedDateStrings.last {
                        Divider()
                    }
                }
                Divider()
                Button("Clear skip dates") {
                    skippedDateComponents = []
                }
                .font(.subheadline.weight(.semibold))
                .padding(.vertical, 10)
            }
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        if let savedMessage {
            SettingsInlineMessage(savedMessage, style: .success)
        }
        if let errorMessage {
            InlineErrorView(errorMessage)
        }
    }

    private var weekdayPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Weekdays")
                .font(.subheadline.weight(.semibold))

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7),
                spacing: 6
            ) {
                ForEach(0 ..< callScheduleWeekdayLabels.count, id: \.self) { weekday in
                    Button {
                        weekdayBinding(weekday).wrappedValue.toggle()
                    } label: {
                        Text(callScheduleWeekdayLabels[weekday])
                            .font(.caption.weight(.bold))
                            .foregroundStyle(input.weekdays.contains(weekday) ? .white : .primary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(
                                input.weekdays.contains(weekday) ? ExeColors.accent : Color.clear,
                                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(.quaternary, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(callScheduleWeekdayLabels[weekday]) weekday")
                    .accessibilityAddTraits(input.weekdays.contains(weekday) ? .isSelected : [])
                }
            }
        }
        .padding(.vertical, 10)
    }

    private var skippedDateStrings: [String] {
        skippedDateComponents.compactMap(Self.dateOnlyString(from:)).sorted()
    }

    private func load() async {
        do {
            let schedule = try await composition.callRepository.getSchedule(workspaceId: workspaceId)

            input.enabled = schedule.enabled
            input.excludedDates = schedule.excludedDates
            input.preNotifyMinutes = schedule.preNotifyMinutes
            input.timeOfDay = schedule.timeOfDay
            input.timezone = schedule.timezone
            input.weekdays = schedule.weekdays
            skippedDateComponents = Set(schedule.excludedDates.compactMap(Self.dateComponents(from:)))
            timeSelection = Self.date(from: schedule.timeOfDay)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() {
        isSaving = true
        savedMessage = nil
        errorMessage = nil
        input.excludedDates = skippedDateStrings
        input.timeOfDay = Self.timeString(from: timeSelection)
        Swift.Task {
            defer { isSaving = false }
            do {
                _ = try await composition.callRepository.putSchedule(
                    workspaceId: workspaceId,
                    input: input
                )
                savedMessage = String(localized: "Saved")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func weekdayBinding(_ weekday: Int) -> Binding<Bool> {
        Binding(
            get: { input.weekdays.contains(weekday) },
            set: { enabled in
                if enabled {
                    input.weekdays = Array(Set(input.weekdays + [weekday])).sorted()
                } else {
                    input.weekdays.removeAll { $0 == weekday }
                }
            }
        )
    }
}

#if DEBUG
extension CallScheduleSettingsScreen {
    init(
        workspaceId: WorkspaceID,
        previewState: CallScheduleSettingsPreviewState
    ) {
        self.workspaceId = workspaceId
        loadsOnAppear = false
        _errorMessage = State(initialValue: previewState.errorMessage)
        _savedMessage = State(initialValue: previewState.savedMessage)

        if let schedule = previewState.schedule {
            let previewInput = Self.previewInput(from: schedule)
            _input = State(initialValue: previewInput)
            _skippedDateComponents = State(
                initialValue: Set(schedule.excludedDates.compactMap(Self.dateComponents(from:)))
            )
            _timeSelection = State(initialValue: Self.date(from: schedule.timeOfDay))
        }
    }
}
#endif
