import SwiftUI

struct AddTodaySheet: View {
    @Environment(JourneyStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var weightTenths = 1000

    var body: some View {
        NavigationStack {
            ZStack {
                CutCoachBackground()

                VStack(spacing: 14) {
                    DatePicker("Entry date", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .trailing)

                    Spacer(minLength: 0)

                    Text("WEIGHT")
                        .font(.caption2.weight(.semibold))
                        .tracking(1.2)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 0) {
                        Picker("Weight", selection: $weightTenths) {
                            ForEach(weightRange, id: \.self) { value in
                                Text((Double(value) / 10).weightText)
                                    .font(.system(.title, design: .rounded, weight: .medium))
                                    .monospacedDigit()
                                    .tag(value)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(width: 190, height: 190)
                        .clipped()
                        .sensoryFeedback(.selection, trigger: weightTenths)

                        Text("kg")
                            .font(.title3.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Weight \(selectedWeight.weightText) kilograms")

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .navigationTitle("Log weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                }
            }
            .onAppear { seed() }
            .onChange(of: date) { _, _ in seed() }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private var weightRange: ClosedRange<Int> { 300...2500 }
    private var selectedWeight: Double { Double(weightTenths) / 10 }

    private func seed() {
        let initial = store.entry(on: date)?.weight ?? store.currentWeight
        weightTenths = min(
            weightRange.upperBound,
            max(weightRange.lowerBound, Int((initial * 10).rounded()))
        )
    }

    private func save() {
        let existing = store.entry(on: date)
        store.save(
            DailyEntry(
                date: date,
                weight: selectedWeight,
                calories: existing?.calories,
                note: existing?.note ?? ""
            )
        )
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        dismiss()
    }
}
