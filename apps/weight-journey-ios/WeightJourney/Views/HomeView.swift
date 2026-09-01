import SwiftUI

struct HomeView: View {
  @Environment(JourneyStore.self) private var store
  @Binding var showingLog: Bool
  @State private var showingEnergyInfo = false

  var body: some View {
    ZStack {
      CutCoachBackground()
      ScrollView {
        VStack(alignment: .leading, spacing: 30) {
          JourneyHero()
          if store.profile.showEnergy { EnergyReservoir(showingInfo: $showingEnergyInfo) }
        }
        .padding(.horizontal, 22)
        .padding(.top, 6)
        .padding(.bottom, 36)
      }
    }
    .navigationTitle("Today")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("Add today", systemImage: "plus") { showingLog = true }
          .labelStyle(.iconOnly)
          .buttonStyle(.glassProminent)
          .tint(JourneyTheme.accent)
          .accessibilityHint("Log today's weight")
      }
    }
    .alert("Estimated energy", isPresented: $showingEnergyInfo) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(
        "A motivational equivalent based on approximately 7,700 kcal per kilogram. Weight trend remains the source of truth."
      )
    }
  }

}

private struct JourneyHero: View {
  @Environment(JourneyStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top, spacing: 7) {
          Text(store.currentWeight.weightText)
            .font(.system(size: 88, weight: .light, design: .rounded))
            .tracking(-5.5)
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .layoutPriority(1)
            .padding(.trailing, 5)
            .contentTransition(.numericText(value: store.currentWeight))
            .animation(.smooth, value: store.currentWeight)
          Text("KG")
            .font(.caption.weight(.bold))
            .tracking(1)
            .foregroundStyle(JourneyTheme.accent)
            .padding(.top, 15)
        }
        HStack(spacing: 7) {
          Image(systemName: weightDelta >= 0 ? "arrow.down.right" : "arrow.up.right")
            .font(.caption.weight(.bold))
          Text("\(abs(weightDelta).weightText) kg")
            .fontWeight(.semibold)
          Text("from \(store.profile.startWeight.weightText)")
            .foregroundStyle(.secondary)
        }
        .font(.subheadline.monospacedDigit())
        .foregroundStyle(weightDelta >= 0 ? Color.green : Color.orange)
      }

      VStack(spacing: 10) {
        GeometryReader { proxy in
          let markerX = max(7, min(proxy.size.width - 7, proxy.size.width * store.progress))
          ZStack(alignment: .leading) {
            Capsule().fill(Color.secondary.opacity(0.14)).frame(height: 5)
            Capsule()
              .fill(
                LinearGradient(
                  colors: [JourneyTheme.cyan, JourneyTheme.accent],
                  startPoint: .leading,
                  endPoint: .trailing
                )
              )
              .frame(width: max(5, markerX), height: 5)
            Circle()
              .fill(JourneyTheme.accent)
              .stroke(.background, lineWidth: 2)
              .frame(width: 15, height: 15)
              .shadow(color: JourneyTheme.accent.opacity(0.3), radius: 6)
              .offset(x: markerX - 7.5)
          }
        }
        .frame(height: 15)

        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text("START")
            Text("\(store.profile.startWeight.weightText) kg")
              .foregroundStyle(.primary)
          }
          Spacer()
          Text(store.progress.formatted(.percent.precision(.fractionLength(0))))
            .font(.subheadline.weight(.semibold).monospacedDigit())
            .foregroundStyle(JourneyTheme.accent)
          Spacer()
          VStack(alignment: .trailing, spacing: 2) {
            Text("GOAL")
            Text("\(store.profile.targetWeight.weightText) kg")
              .foregroundStyle(.primary)
          }
        }
        .font(.caption2.weight(.medium).monospacedDigit())
        .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "Current weight \(store.currentWeight.weightText) kilograms. Journey \(store.progress.formatted(.percent)), from \(store.profile.startWeight.weightText) to \(store.profile.targetWeight.weightText) kilograms."
    )
  }

  private var weightDelta: Double { store.profile.startWeight - store.currentWeight }
}

private struct EnergyReservoir: View {
  @Environment(JourneyStore.self) private var store
  @Binding var showingInfo: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 5) {
        Text("To goal").font(.headline)
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
      Text(
        "\(store.energyCompleted.formatted(.number.precision(.fractionLength(0)))) completed of \(store.totalEnergy.formatted(.number.precision(.fractionLength(0)))) kcal"
      )
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
    TimelineView(.animation(minimumInterval: reduceMotion ? 1 : 1 / 30, paused: reduceMotion)) {
      timeline in
      GeometryReader { proxy in
        let liquidHeight = max(12, proxy.size.height * level)
        let phase =
          reduceMotion
          ? 0 : timeline.date.timeIntervalSinceReferenceDate.remainder(dividingBy: 4) / 4
        ZStack(alignment: .bottom) {
          RoundedRectangle(cornerRadius: 30, style: .continuous)
            .fill(Color.primary.opacity(0.045))

          WaveShape(phase: phase, amplitude: 5)
            .fill(
              LinearGradient(
                colors: [
                  JourneyTheme.energyHighlight.opacity(0.88), JourneyTheme.energy.opacity(0.96),
                ],
                startPoint: .top,
                endPoint: .bottom
              )
            )
            .frame(height: liquidHeight + 8)
            .animation(.smooth(duration: 0.8), value: level)

          WaveShape(phase: 1 - phase * 0.72, amplitude: 3)
            .fill(.white.opacity(0.16))
            .frame(height: liquidHeight + 5)
            .blendMode(.softLight)

          if !reduceMotion {
            ReservoirBubbles(phase: phase, liquidHeight: liquidHeight)
          }

          LinearGradient(
            colors: [.white.opacity(0.24), .clear, .white.opacity(0.06)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
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

private struct ReservoirBubbles: View {
  let phase: Double
  let liquidHeight: Double

  var body: some View {
    GeometryReader { proxy in
      ForEach(0..<5, id: \.self) { index in
        let seed = Double(index) / 5
        let travel = (phase * (0.7 + seed) + seed).truncatingRemainder(dividingBy: 1)
        Circle()
          .stroke(.white.opacity(0.22), lineWidth: 1)
          .frame(width: 4 + seed * 5, height: 4 + seed * 5)
          .position(
            x: proxy.size.width * (0.14 + seed * 0.7),
            y: proxy.size.height - min(liquidHeight - 8, 8 + travel * max(10, liquidHeight - 18))
          )
      }
    }
    .allowsHitTesting(false)
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
