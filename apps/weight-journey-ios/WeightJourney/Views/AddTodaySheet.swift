import SwiftUI

struct AddTodaySheet: View {
    @Environment(JourneyStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var weight = ""
    @State private var weightTenths = 1000
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
                    if isTypingWeight {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            TextField(store.currentWeight.weightText, text: $weight)
                                .font(.system(size: 56, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .keyboardType(.decimalPad)
                                .focused($focused, equals: .weight)
                                .textFieldStyle(.plain)
                            Text("kg")
                                .font(.title3)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        HStack(spacing: 0) {
                            Picker("Weight", selection: $weightTenths) {
                                ForEach(weightRange, id: \.self) { value in
                                    Text((Double(value) / 10).weightText)
                                        .font(.title2.monospacedDigit())
                                        .tag(value)
                                }
                            }
                            .pickerStyle(.wheel)
                            .frame(maxWidth: .infinity)
                            .frame(height: 174)
                            .clipped()
                            .sensoryFeedback(.selection, trigger: weightTenths)

                            Text("kg")
                                .font(.title2.weight(.medium))
                                .foregroundStyle(.secondary)
                                .padding(.trailing, 30)
                        }
                        .onChange(of: weightTenths) { _, newValue in
                            weight = (Double(newValue) / 10).weightText
                        }
                    }
                } header: {
                    HStack {
                        Text("Weight")
                        Spacer()
                        Button(isTypingWeight ? "Use wheel" : "Type", systemImage: isTypingWeight ? "dial.medium" : "keyboard") {
                            if isTypingWeight {
                                focused = nil
                                isTypingWeight = false
                            } else {
                                isTypingWeight = true
                                Task { @MainActor in focused = .weight }
                            }
                        }
                        .textCase(nil)
                    }
                } footer: { Text("Scroll to adjust in 0.1 kg steps.") }

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
                let newTenths = Int((value * 10).rounded())
                if weightRange.contains(newTenths), weightTenths != newTenths { weightTenths = newTenths }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var parsedWeight: Double? { Double(weight.replacingOccurrences(of: ",", with: ".")) }
    private var weightRange: ClosedRange<Int> { 300...2500 }

    private func seed() {
        if let existing = store.entry(on: date) {
            weight = existing.weight?.weightText ?? ""
            calories = existing.calories.map(String.init) ?? ""
            note = existing.note
        } else { weight = store.currentWeight.weightText }
        let initial = parsedWeight ?? store.currentWeight
        weightTenths = min(weightRange.upperBound, max(weightRange.lowerBound, Int((initial * 10).rounded())))
    }

    private func save() {
        guard let parsedWeight else { return }
        store.save(DailyEntry(date: date, weight: parsedWeight, calories: Int(calories), note: note))
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        dismiss()
    }
}
