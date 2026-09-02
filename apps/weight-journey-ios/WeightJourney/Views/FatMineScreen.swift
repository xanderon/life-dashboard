import SwiftUI

struct FatMineScreen: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        ZStack {
            mineBackground
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    summary
                    IcebergMineScene(progress: store.progress, remaining: store.remainingWeight)
                        .frame(height: 390)
                    recentShifts
                    explanation
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
        }
        .navigationTitle("Fat Mine")
        .navigationBarTitleDisplayMode(.large)
    }

    private var mineBackground: some View {
        LinearGradient(
            colors: [Color(red: 0.025, green: 0.08, blue: 0.14), Color(red: 0.04, green: 0.19, blue: 0.24), JourneyTheme.ink],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var summary: some View {
        HStack(spacing: 12) {
            mineMetric("MINED", value: "\(store.lostWeight.weightText) kg", color: JourneyTheme.cyan)
            mineMetric("REMAINING", value: "\(store.remainingWeight.weightText) kg", color: JourneyTheme.energyHighlight)
        }
    }

    private func mineMetric(_ label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption2.bold()).tracking(1.2).foregroundStyle(.white.opacity(0.58))
            Text(value).font(.title2.bold().monospacedDigit()).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.white.opacity(0.07), in: .rect(cornerRadius: 22))
        .overlay { RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.1)) }
    }

    private var recentShifts: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Recent shifts").font(.title2.bold()).foregroundStyle(.white)
            if shifts.isEmpty {
                Text("Log a few weights to reveal daily mining shifts.")
                    .foregroundStyle(.white.opacity(0.6))
            } else {
                ForEach(shifts) { shift in
                    HStack(spacing: 12) {
                        Text(shift.date.formatted(.dateTime.weekday(.abbreviated)))
                            .font(.caption.bold())
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(width: 34, alignment: .leading)
                        GeometryReader { proxy in
                            Capsule()
                                .fill(.white.opacity(0.08))
                                .overlay(alignment: .leading) {
                                    Capsule()
                                        .fill(shift.grams > 0 ? JourneyTheme.cyan.gradient : Color.white.opacity(0.12).gradient)
                                        .frame(width: max(4, proxy.size.width * min(1, shift.grams / maxShift)))
                                }
                        }
                        .frame(height: 9)
                        Text(shift.grams > 0 ? "−\(Int(shift.grams)) g" : "—")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(shift.grams > 0 ? JourneyTheme.cyan : .white.opacity(0.42))
                            .frame(width: 58, alignment: .trailing)
                    }
                }
            }
        }
        .padding(20)
        .background(.white.opacity(0.055), in: .rect(cornerRadius: 28))
        .overlay { RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(0.1)) }
    }

    private var explanation: some View {
        Label(
            "Mining is a playful estimate derived from scale changes. Water and daily fluctuations are not body-fat measurements; the longer trend remains the signal.",
            systemImage: "info.circle"
        )
        .font(.caption)
        .foregroundStyle(.white.opacity(0.55))
    }

    private var shifts: [MineShift] {
        let entries = store.weightEntries.suffix(8)
        return zip(entries, entries.dropFirst()).map { previous, current in
            MineShift(
                date: current.date,
                grams: max(0, ((previous.weight ?? 0) - (current.weight ?? 0)) * 1000)
            )
        }.suffix(7)
    }

    private var maxShift: Double { max(100, shifts.map(\.grams).max() ?? 100) }
}

private struct MineShift: Identifiable {
    let date: Date
    let grams: Double
    var id: Date { date }
}

private struct IcebergMineScene: View {
    let progress: Double
    let remaining: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 1 : 1 / 24, paused: reduceMotion)) { timeline in
            GeometryReader { proxy in
                let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                let mineX = proxy.size.width * (0.2 + progress * 0.55)
                ZStack {
                    water(phase: phase)
                    iceberg
                    minedCavern(width: proxy.size.width)
                    pickaxe(phase: phase)
                        .position(x: mineX, y: proxy.size.height * 0.6)
                    chips(phase: phase, originX: mineX, size: proxy.size)
                    VStack(spacing: 3) {
                        Text("\(remaining.weightText) KG")
                            .font(.system(.title, design: .rounded, weight: .bold))
                        Text("ICE LEFT")
                            .font(.caption2.bold()).tracking(1.4)
                    }
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.35), radius: 8)
                    .position(x: proxy.size.width * 0.67, y: proxy.size.height * 0.62)
                }
                .clipShape(.rect(cornerRadius: 30))
                .overlay { RoundedRectangle(cornerRadius: 30).stroke(.white.opacity(0.14)) }
            }
        }
    }

    private func water(phase: Double) -> some View {
        ZStack {
            LinearGradient(colors: [.cyan.opacity(0.08), .blue.opacity(0.3), .black.opacity(0.2)], startPoint: .top, endPoint: .bottom)
            ForEach(0..<4, id: \.self) { line in
                Capsule()
                    .fill(.white.opacity(0.08 - Double(line) * 0.012))
                    .frame(height: 2)
                    .offset(x: sin(phase * 0.5 + Double(line)) * 18, y: CGFloat(line * 34 - 150))
            }
        }
    }

    private var iceberg: some View {
        IcebergShape()
            .fill(
                LinearGradient(
                    colors: [.white.opacity(0.9), JourneyTheme.cyan.opacity(0.78), Color.blue.opacity(0.42), Color.indigo.opacity(0.55)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay { IcebergShape().stroke(.white.opacity(0.45), lineWidth: 1.2) }
            .padding(.horizontal, 24)
            .padding(.vertical, 25)
            .shadow(color: JourneyTheme.cyan.opacity(0.24), radius: 28)
    }

    private func minedCavern(width: Double) -> some View {
        UnevenRoundedRectangle(topLeadingRadius: 8, bottomLeadingRadius: 8, bottomTrailingRadius: 34, topTrailingRadius: 34)
            .fill(Color.black.opacity(0.58))
            .frame(width: max(20, width * progress * 0.56), height: 112)
            .offset(x: -width * 0.28, y: 48)
            .shadow(color: .cyan.opacity(0.16), radius: 12)
    }

    private func pickaxe(phase: Double) -> some View {
        Image(systemName: "hammer.fill")
            .font(.system(size: 31, weight: .bold))
            .foregroundStyle(JourneyTheme.energyHighlight)
            .shadow(color: .orange.opacity(0.5), radius: 8)
            .rotationEffect(.degrees(reduceMotion ? -35 : -35 + sin(phase * 4.8) * 24), anchor: .bottomTrailing)
    }

    private func chips(phase: Double, originX: Double, size: CGSize) -> some View {
        ForEach(0..<6, id: \.self) { index in
            let seed = Double(index) / 6
            let travel = (phase * 0.65 + seed).truncatingRemainder(dividingBy: 1)
            Circle()
                .fill(index.isMultiple(of: 2) ? JourneyTheme.cyan : .white)
                .frame(width: 3 + seed * 4)
                .position(
                    x: originX + cos(seed * 12) * travel * 42,
                    y: size.height * 0.6 + travel * 60
                )
                .opacity(1 - travel)
        }
    }
}

private struct IcebergShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.width * 0.1, y: rect.height * 0.42))
        path.addLine(to: CGPoint(x: rect.width * 0.26, y: rect.height * 0.3))
        path.addLine(to: CGPoint(x: rect.width * 0.38, y: rect.height * 0.08))
        path.addLine(to: CGPoint(x: rect.width * 0.53, y: rect.height * 0.28))
        path.addLine(to: CGPoint(x: rect.width * 0.72, y: rect.height * 0.36))
        path.addLine(to: CGPoint(x: rect.width * 0.92, y: rect.height * 0.48))
        path.addLine(to: CGPoint(x: rect.width * 0.8, y: rect.height * 0.9))
        path.addLine(to: CGPoint(x: rect.width * 0.42, y: rect.height * 0.96))
        path.addLine(to: CGPoint(x: rect.width * 0.14, y: rect.height * 0.74))
        path.closeSubpath()
        return path
    }
}
