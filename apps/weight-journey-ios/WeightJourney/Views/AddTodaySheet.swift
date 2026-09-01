import SwiftUI

struct AddTodaySheet: View {
    @Environment(JourneyStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var weight = ""
    @State private var sliderWeight = 100.0
    @State private var sliderBounds = 95.0...105.0
    @State private var sliderTick = 0
    @State private var calories = ""
    @State private var note = ""
    @State private var isTypingWeight = false
    @State private var showsOptionalDetails = false
    @FocusState private var focused: Field?

    private enum Field { case weight, calories, note }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                Section {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        if isTypingWeight {
                            TextField(store.currentWeight.weightText, text: $weight)
                                .font(.system(size: 56, weight: .semibold, design: .rounded))
                                .tracking(-2)
                                .keyboardType(.decimalPad)
                                .focused($focused, equals: .weight)
                                .textFieldStyle(.plain)
                        } else {
                            Text(parsedWeight?.weightText ?? store.currentWeight.weightText)
                                .font(.system(size: 56, weight: .semibold, design: .rounded))
                                .tracking(-2)
                                .contentTransition(.numericText(value: parsedWeight ?? store.currentWeight))
                                .animation(.smooth, value: parsedWeight)
                        }
                        Text("kg")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        Button(isTypingWeight ? "Done" : "Type", systemImage: isTypingWeight ? "checkmark" : "keyboard") {
                            if isTypingWeight {
                                focused = nil
                                isTypingWeight = false
                            } else {
                                isTypingWeight = true
                                Task { @MainActor in focused = .weight }
                            }
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.bordered)
                        .accessibilityLabel(isTypingWeight ? "Finish typing" : "Type weight")
                    }
                    Slider(
                        value: $sliderWeight,
                        in: sliderBounds,
                        step: 0.1
                    ) {
                        Text("Weight")
                    } minimumValueLabel: {
                        Image(systemName: "minus")
                    } maximumValueLabel: {
                        Image(systemName: "plus")
                    } onEditingChanged: { editing in
                        if !editing { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
                    }
                    .tint(JourneyTheme.accent)
                    .onChange(of: sliderWeight) { _, newValue in
                        weight = newValue.weightText
                        sliderTick += 1
                    }
                    .sensoryFeedback(.selection, trigger: sliderTick)

                    HStack {
                        Text(sliderBounds.lowerBound.weightText)
                        Spacer()
                        Text("Slide in 0.1 kg steps")
                        Spacer()
                        Text(sliderBounds.upperBound.weightText)
                    }
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                } header: { Text("Weight") } footer: { Text("This is the only essential field.") }

                Section {
                    DisclosureGroup("Optional details", isExpanded: $showsOptionalDetails) {
                        LabeledContent("Calories") {
                            TextField("Not tracked", text: $calories)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .focused($focused, equals: .calories)
                        }
                        TextField("Note", text: $note, axis: .vertical)
                            .lineLimit(2...4)
                            .focused($focused, equals: .note)
                    }
                }
            }
            .navigationTitle("Add today")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .disabled(parsedWeight == nil)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focused = nil }
                }
            }
            .onAppear { seed() }
            .onChange(of: date) { _, _ in seed() }
            .onChange(of: weight) { _, newValue in
                guard let value = Double(newValue.replacingOccurrences(of: ",", with: ".")) else { return }
                if !sliderBounds.contains(value) {
                    sliderBounds = (value - 5)...(value + 5)
                }
                if abs(sliderWeight - value) >= 0.05 { sliderWeight = value }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var parsedWeight: Double? { Double(weight.replacingOccurrences(of: ",", with: ".")) }

    private func seed() {
        if let existing = store.entry(on: date) {
            weight = existing.weight?.weightText ?? ""
            calories = existing.calories.map(String.init) ?? ""
            note = existing.note
        } else { weight = store.currentWeight.weightText }
        let initial = parsedWeight ?? store.currentWeight
        sliderWeight = initial
        sliderBounds = (initial - 5)...(initial + 5)
    }

    private func save() {
        guard let parsedWeight else { return }
        store.save(DailyEntry(date: date, weight: parsedWeight, calories: Int(calories), note: note))
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        dismiss()
    }
}
