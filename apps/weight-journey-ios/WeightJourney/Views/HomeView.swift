import SwiftUI

struct HomeView: View {
    @Environment(JourneyStore.self) private var store
    @State private var showingEnergyInfo = false

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    WeightHero()
                    JourneyTrack()
                    if store.profile.showEnergy { EnergyReservoir(showingInfo: $showingEnergyInfo) }
                }
                .padding(.horizontal, 22)
                .padding(.top, 6)
                .padding(.bottom, 36)
            }
        }
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.large)
        .alert("Estimated energy", isPresented: $showingEnergyInfo) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("A motivational equivalent based on approximately 7,700 kcal per kilogram. Weight trend remains the source of truth.")
        }
    }

}

private struct WeightHero: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CURRENT WEIGHT")
                .font(.caption.weight(.semibold))
                .tracking(1.1)
                .foregroundStyle(.secondary)
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
            Text("\(store.lostWeight.weightText) kg down from start")
                .font(.subheadline.weight(.medium).monospacedDigit())
                .foregroundStyle(.secondary)
            Text("Updated today")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Current weight \(store.currentWeight.weightText) kilograms. \(store.lostWeight.weightText) kilograms lost, \(store.remainingWeight.weightText) kilograms to go.")
    }
}

private struct JourneyTrack: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        VStack(spacing: 9) {
            GeometryReader { proxy in
                let markerX = max(7, min(proxy.size.width - 7, proxy.size.width * store.progress))
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.18)).frame(height: 3)
                    Capsule()
                        .fill(JourneyTheme.accent)
                        .frame(width: max(3, markerX), height: 3)
                    Circle()
                        .fill(JourneyTheme.accent)
                        .stroke(.background, lineWidth: 2)
                        .frame(width: 13, height: 13)
                        .offset(x: markerX - 6.5)
                    Text(store.currentWeight.weightText)
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(JourneyTheme.accent)
                        .position(x: markerX, y: 0)
                }
                .padding(.top, 15)
            }
            .frame(height: 32)

            HStack {
                Text("\(store.profile.startWeight.weightText) kg")
                Spacer()
                Text("\(store.profile.targetWeight.weightText) kg")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            Text("\(store.progress.formatted(.percent.precision(.fractionLength(0)))) complete")
                .font(.subheadline.weight(.medium).monospacedDigit())
                .frame(maxWidth: .infinity)
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
                Text("What remains").font(.headline)
                Button("About energy estimate", systemImage: "info.circle") { showingInfo = true }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(store.remainingWeight.weightText)
                    .font(.system(.largeTitle, design: .rounded, weight: .semibold))
                    .contentTransition(.numericText(value: store.remainingWeight))
                Text("kg to goal")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            LiquidReservoir(level: 1 - store.progress)
                .frame(height: 132)

            Text("\(store.energyRemaining.formatted(.number.precision(.fractionLength(0)))) kcal")
                .font(.title3.bold().monospacedDigit())
            Text("Estimated deficit equivalent to goal")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("\(store.energyCompleted.formatted(.number.precision(.fractionLength(0)))) completed of \(store.totalEnergy.formatted(.number.precision(.fractionLength(0)))) kcal")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LiquidReservoir: View {
    let level: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 1 : 1 / 30, paused: reduceMotion)) { timeline in
            GeometryReader { proxy in
                let liquidHeight = max(12, proxy.size.height * level)
                let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate.remainder(dividingBy: 4) / 4
                ZStack(alignment: .bottom) {
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .fill(Color.primary.opacity(0.045))

                    WaveShape(phase: phase, amplitude: 5)
                        .fill(
                            LinearGradient(
                                colors: [JourneyTheme.energyHighlight.opacity(0.88), JourneyTheme.energy.opacity(0.96)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: liquidHeight + 8)
                        .animation(.smooth(duration: 0.8), value: level)

                    LinearGradient(colors: [.white.opacity(0.16), .clear], startPoint: .top, endPoint: .bottom)
                        .clipShape(.rect(cornerRadius: 30))

                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .stroke(Color.primary.opacity(0.14), lineWidth: 1)
                }
                .clipShape(.rect(cornerRadius: 30))
                .shadow(color: JourneyTheme.energy.opacity(0.13), radius: 20, y: 9)
            }
        }
    }
}

private struct WaveShape: Shape {
    var phase: Double
    var amplitude: Double

    var animatableData: Double {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: amplitude))
        for x in stride(from: 0.0, through: rect.width, by: 2) {
            let angle = (x / rect.width * .pi * 2) + (phase * .pi * 2)
            path.addLine(to: CGPoint(x: x, y: amplitude + sin(angle) * amplitude))
        }
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: rect.height))
        path.closeSubpath()
        return path
    }
}
