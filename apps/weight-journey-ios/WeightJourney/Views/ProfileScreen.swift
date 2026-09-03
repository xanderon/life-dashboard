import SwiftUI

struct ProfileScreen: View {
    @Environment(JourneyStore.self) private var store
    @State private var confirmingRestart = false

    var body: some View {
        @Bindable var store = store
        Form {
            Section {
                HStack(spacing: 14) {
                    Image(systemName: "figure.walk.motion")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                        .background(JourneyTheme.accent.gradient, in: .circle)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Weight Journey").font(.headline)
                        Text("Your goal, guidance and preferences").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
            Section("Goal") {
                numericRow("Starting weight", value: $store.profile.startWeight, unit: "kg")
                numericRow("Target weight", value: $store.profile.targetWeight, unit: "kg")
                numericRow("Height", value: $store.profile.height, unit: "cm")
                Stepper("Desired timeframe: \(store.profile.targetMonths) months", value: $store.profile.targetMonths, in: 3...18)
            }

            Section("Optional guidance") {
                LabeledContent("Calorie target") {
                    TextField("2350", value: $store.profile.calorieTarget, format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    Text("kcal").foregroundStyle(.secondary)
                }
                Toggle("Show calories", isOn: $store.profile.showCalories)
                Toggle("Show energy visualization", isOn: $store.profile.showEnergy)
            }

            Section("Reminders") {
                Toggle("Morning weigh-in", isOn: $store.profile.weighInReminder)
                Toggle("Weekly review", isOn: $store.profile.reviewReminder)
            }

            Section("Appearance") {
                Picker("Theme", selection: $store.profile.appearance) {
                    ForEach(AppAppearance.allCases) { Text($0.title).tag($0) }
                }
            }

            Section("About") {
                NavigationLink("How the app works", destination: CodeScreen())
                LabeledContent("Version", value: "1.0")
            }

            Section {
                Button("Restart journey", systemImage: "arrow.counterclockwise", role: .destructive) {
                    confirmingRestart = true
                }
            } header: {
                Text("Journey")
            } footer: {
                Text("Starts again from your current weight. Existing entries stay in your history.")
            }
        }
        .scrollContentBackground(.hidden)
        .background { CutCoachBackground() }
        .navigationTitle("Profile")
        .confirmationDialog(
            "Restart from \(store.currentWeight.weightText) kg?",
            isPresented: $confirmingRestart,
            titleVisibility: .visible
        ) {
            Button("Restart journey", role: .destructive) { store.restartJourney() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Progress returns to zero and today becomes the new start date. Your history is preserved.")
        }
    }

    private func numericRow(_ title: String, value: Binding<Double>, unit: String) -> some View {
        LabeledContent(title) {
            TextField(title, value: value, format: .number.precision(.fractionLength(1)))
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
            Text(unit).foregroundStyle(.secondary)
        }
    }
}
