import SwiftUI

struct HomeView: View {
    @Environment(JourneyStore.self) private var store
    @Binding var showingLog: Bool
    @State private var showingEnergyInfo = false

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    greeting
                    WeightHero()
                    JourneyTrack()
                    if store.profile.showEnergy { EnergyReservoir(showingInfo: $showingEnergyInfo) }
                    Button { showingLog = true } label: {
                        Label("Add today", systemImage: "plus")
                            .frame(maxWidth: .infinity)
                    }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .tint(JourneyTheme.accent)
                }
                .padding(.horizontal, 22)
                .padding(.top, 10)
                .padding(.bottom, 26)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .alert("Estimated energy", isPresented: $showingEnergyInfo) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("A motivational equivalent based on approximately 7,700 kcal per kilogram. Weight trend remains the source of truth.")
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greetingText)
                .font(.title3.weight(.semibold))
            Text("You’re \(store.progress.formatted(.percent.precision(.fractionLength(0)))) of the way there.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: .now)
        if hour < 12 { return "Good morning, Alex" }
        if hour < 18 { return "Good afternoon, Alex" }
        return "Good evening, Alex"
    }
}

private struct WeightHero: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(store.currentWeight.weightText)
                    .font(.system(size: 82, weight: .semibold, design: .rounded))
                    .tracking(-5)
                    .contentTransition(.numericText(value: store.currentWeight))
                    .animation(.smooth, value: store.currentWeight)
                Text("kg")
                    .font(.title2.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Text("\(store.lostWeight.weightText) kg lost  •  \(store.remainingWeight.weightText) kg to go")
                .font(.headline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Current weight \(store.currentWeight.weightText) kilograms. \(store.lostWeight.weightText) kilograms lost, \(store.remainingWeight.weightText) kilograms to go.")
    }
}

private struct JourneyTrack: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        VStack(spacing: 10) {
            GeometryReader { proxy in
                let markerX = max(13, min(proxy.size.width - 13, proxy.size.width * store.progress))
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.16)).frame(height: 7)
                    Capsule()
                        .fill(LinearGradient(colors: [JourneyTheme.accent, JourneyTheme.cyan], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(7, markerX), height: 7)
                    Circle()
                        .fill(JourneyTheme.accent)
                        .stroke(.background, lineWidth: 3)
                        .frame(width: 22, height: 22)
                        .offset(x: markerX - 11)
                    Text(store.currentWeight.weightText)
                        .font(.caption.bold().monospacedDigit())
                        .foregroundStyle(JourneyTheme.accent)
                        .position(x: markerX, y: 0)
                }
                .padding(.top, 18)
            }
            .frame(height: 42)

            HStack {
                Text("\(store.profile.startWeight.weightText) kg")
                Spacer()
                Text(store.progress, format: .percent.precision(.fractionLength(0)))
                    .foregroundStyle(JourneyTheme.accent)
                Text("complete").foregroundStyle(.secondary)
                Spacer()
                Text("\(store.profile.targetWeight.weightText) kg")
            }
            .font(.subheadline.weight(.semibold).monospacedDigit())
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Journey \(store.progress.formatted(.percent)), from \(store.profile.startWeight.weightText) to \(store.profile.targetWeight.weightText) kilograms")
    }
}

private struct EnergyReservoir: View {
    @Environment(JourneyStore.self) private var store
    @Binding var showingInfo: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 5) {
                Text("Energy remaining").font(.headline)
                Button("About energy estimate", systemImage: "info.circle") { showingInfo = true }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            HorizontalReservoir(level: 1 - store.progress)
                .frame(height: 92)

            Text("\(store.energyRemaining.formatted(.number.precision(.fractionLength(0)))) kcal remaining")
                .font(.title3.bold().monospacedDigit())
            Text("\(store.energyCompleted.formatted(.number.precision(.fractionLength(0)))) completed of \(store.totalEnergy.formatted(.number.precision(.fractionLength(0))))")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct HorizontalReservoir: View {
    let level: Double

    var body: some View {
        GeometryReader { proxy in
            let fillWidth = max(10, proxy.size.width * level)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 25, style: .continuous)
                    .fill(.thinMaterial)
                RoundedRectangle(cornerRadius: 21, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [JourneyTheme.accent.opacity(0.94), JourneyTheme.cyan.opacity(0.82)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: fillWidth)
                    .padding(4)
                    .animation(.smooth(duration: 0.8), value: level)
                RoundedRectangle(cornerRadius: 25, style: .continuous)
                    .stroke(Color.primary.opacity(0.12), lineWidth: 1)
            }
            .shadow(color: JourneyTheme.accent.opacity(0.14), radius: 18, y: 8)
        }
    }
}
