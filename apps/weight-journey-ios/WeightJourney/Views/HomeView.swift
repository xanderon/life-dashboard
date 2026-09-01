import SwiftUI

struct HomeView: View {
    @Environment(JourneyStore.self) private var store
    @Binding var showingLog: Bool

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(spacing: 28) {
                    WeightHero()
                    JourneyTrack()
                    if store.profile.showEnergy { EnergyReservoir() }
                    calmSummary
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .navigationTitle("Journey")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add today", systemImage: "plus") { showingLog = true }
                    .buttonStyle(.glassProminent)
            }
        }
    }

    private var calmSummary: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "waveform.path.ecg")
                .foregroundStyle(JourneyTheme.accent)
            VStack(alignment: .leading, spacing: 5) {
                Text("The direction matters")
                    .font(.headline)
                Text("Morning changes are noisy. Your longer trend is the signal worth following.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }
}

private struct WeightHero: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        VStack(spacing: 10) {
            ScaleFigure(weight: store.currentWeight)
                .frame(height: 285)

            HStack(spacing: 24) {
                metric("LOST", value: "\(store.lostWeight.weightText) kg")
                Divider().frame(height: 34)
                metric("REMAINING", value: "\(store.remainingWeight.weightText) kg")
            }
            .padding(.top, 8)
        }
        .padding(.top, 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Current weight \(store.currentWeight.weightText) kilograms. \(store.lostWeight.weightText) kilograms lost, \(store.remainingWeight.weightText) kilograms remaining.")
    }

    private func metric(_ label: String, value: String) -> some View {
        VStack(spacing: 3) {
            Text(value).font(.headline.monospacedDigit())
            Text(label).font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(.secondary)
        }
    }
}

private struct ScaleFigure: View {
    let weight: Double
    var body: some View {
        ZStack(alignment: .bottom) {
            Circle()
                .fill(JourneyTheme.cyan.opacity(0.11))
                .frame(width: 230, height: 230)
                .blur(radius: 1)
            Image(systemName: "figure.stand")
                .font(.system(size: 156, weight: .ultraLight))
                .foregroundStyle(
                    LinearGradient(colors: [JourneyTheme.cyan, JourneyTheme.accent], startPoint: .top, endPoint: .bottom)
                )
                .padding(.bottom, 82)
            RoundedRectangle(cornerRadius: 12)
                .fill(.regularMaterial)
                .stroke(JourneyTheme.accent.opacity(0.45), lineWidth: 1)
                .frame(width: 242, height: 88)
                .overlay {
                    VStack(spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(weight.weightText)
                                .font(.system(size: 52, weight: .semibold, design: .rounded))
                                .tracking(-2)
                                .contentTransition(.numericText(value: weight))
                            Text("kg").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                        }
                        Text("CURRENT WEIGHT").font(.caption2.bold()).tracking(1.6).foregroundStyle(.secondary)
                    }
                }
                .shadow(color: JourneyTheme.accent.opacity(0.16), radius: 16, y: 8)
        }
    }
}

private struct JourneyTrack: View {
    @Environment(JourneyStore.self) private var store
    var body: some View {
        VStack(spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("START").font(.caption2.bold()).foregroundStyle(.secondary)
                    Text("\(store.profile.startWeight.weightText) kg").font(.subheadline.bold())
                }
                Spacer()
                Text(store.progress, format: .percent.precision(.fractionLength(0)))
                    .font(.title2.bold().monospacedDigit())
                    .foregroundStyle(JourneyTheme.accent)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("GOAL").font(.caption2.bold()).foregroundStyle(.secondary)
                    Text("\(store.profile.targetWeight.weightText) kg").font(.subheadline.bold())
                }
            }
            ProgressView(value: store.progress)
                .tint(JourneyTheme.accent)
                .scaleEffect(x: 1, y: 1.7)
                .animation(.smooth, value: store.progress)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Journey \(store.progress.formatted(.percent)), from \(store.profile.startWeight.weightText) to \(store.profile.targetWeight.weightText) kilograms")
    }
}

private struct EnergyReservoir: View {
    @Environment(JourneyStore.self) private var store
    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(store.energyRemaining, format: .number.precision(.fractionLength(0)))
                            .font(.title.bold().monospacedDigit())
                        Text("kcal equivalent remaining").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    ReservoirShape(level: 1 - store.progress)
                        .frame(width: 84, height: 108)
                }
                LabeledContent {
                    Text("Approximation").foregroundStyle(.secondary)
                } label: {
                    Label("\(store.energyCompleted.formatted(.number.precision(.fractionLength(0)))) completed", systemImage: "checkmark.circle")
                }
                .font(.caption)
            }
        } label: {
            Label("Estimated energy", systemImage: "drop.fill")
                .font(.headline)
                .foregroundStyle(JourneyTheme.warm)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ReservoirShape: View {
    let level: Double
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                UnevenRoundedRectangle(topLeadingRadius: 34, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 34)
                    .fill(.quaternary)
                UnevenRoundedRectangle(topLeadingRadius: 26, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 26)
                    .fill(LinearGradient(colors: [JourneyTheme.warm, JourneyTheme.accent], startPoint: .top, endPoint: .bottom))
                    .frame(height: max(8, proxy.size.height * level))
                    .animation(.smooth(duration: 0.8), value: level)
            }
            .overlay { UnevenRoundedRectangle(topLeadingRadius: 34, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 34).stroke(.secondary.opacity(0.25)) }
        }
    }
}
