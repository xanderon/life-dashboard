import SwiftUI

struct FatMineScreen: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.025, green: 0.035, blue: 0.07), Color(red: 0.07, green: 0.055, blue: 0.055)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    intro
                    DepositCoreScene(progress: store.progress)
                        .frame(height: 360)
                    balance
                    recentWork
                    note
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .navigationTitle("The Deposit")
        .navigationBarTitleDisplayMode(.large)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("ORIGINAL MASS")
                .font(.caption2.bold())
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.48))
            Text("\(store.totalWeight.weightText) kg")
                .font(.system(size: 46, weight: .light, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
            Text("One finite deposit. Every logged shift reveals the work already done.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.58))
        }
    }

    private var balance: some View {
        HStack(spacing: 0) {
            balanceMetric("EXTRACTED", "\(store.lostWeight.weightText) kg", JourneyTheme.cyan)
            Rectangle().fill(.white.opacity(0.12)).frame(width: 1, height: 48)
            balanceMetric("IN THE VEIN", "\(store.remainingWeight.weightText) kg", JourneyTheme.energyHighlight)
        }
        .padding(.vertical, 18)
        .background(.white.opacity(0.055), in: .rect(cornerRadius: 24))
        .overlay { RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.1)) }
    }

    private func balanceMetric(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption2.bold()).tracking(1.1).foregroundStyle(.white.opacity(0.45))
            Text(value).font(.title3.bold().monospacedDigit()).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
    }

    private var recentWork: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                Text("Last 7 shifts").font(.title2.bold())
                Spacer()
                Text("scale signal").font(.caption).foregroundStyle(.white.opacity(0.45))
            }

            if shifts.isEmpty {
                Text("Log more weights to reveal recent extraction.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.55))
            } else {
                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(shifts) { shift in
                        VStack(spacing: 8) {
                            Text(shift.grams > 0 ? "\(Int(shift.grams))" : "·")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(shift.grams > 0 ? .white : .white.opacity(0.3))
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(
                                    shift.grams > 0
                                        ? AnyShapeStyle(LinearGradient(colors: [JourneyTheme.energyHighlight, JourneyTheme.energy], startPoint: .top, endPoint: .bottom))
                                        : AnyShapeStyle(Color.white.opacity(0.08))
                                )
                                .frame(height: max(6, 74 * shift.grams / maxShift))
                            Text(shift.date.formatted(.dateTime.weekday(.narrow)))
                                .font(.caption2.bold())
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 116, alignment: .bottom)
            }
        }
        .padding(20)
        .background(.white.opacity(0.045), in: .rect(cornerRadius: 26))
        .overlay { RoundedRectangle(cornerRadius: 26).stroke(.white.opacity(0.09)) }
    }

    private var note: some View {
        Text("A motivational model based on scale changes, not a body-fat measurement. Daily water shifts can move the estimate in either direction.")
            .font(.caption)
            .foregroundStyle(.white.opacity(0.42))
    }

    private var shifts: [MineShift] {
        let entries = store.weightEntries.suffix(8)
        return Array(zip(entries, entries.dropFirst()).map { previous, current in
            MineShift(
                date: current.date,
                grams: max(0, ((previous.weight ?? 0) - (current.weight ?? 0)) * 1000)
            )
        }.suffix(7))
    }

    private var maxShift: Double { max(100, shifts.map(\.grams).max() ?? 100) }
}

private struct MineShift: Identifiable {
    let date: Date
    let grams: Double
    var id: Date { date }
}

private struct DepositCoreScene: View {
    let progress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 1 : 1 / 24, paused: reduceMotion)) { timeline in
            GeometryReader { proxy in
                let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                let inset: CGFloat = 18
                let coreWidth = proxy.size.width - inset * 2
                let frontX = inset + coreWidth * progress

                ZStack {
                    RoundedRectangle(cornerRadius: 32)
                        .fill(.black.opacity(0.24))

                    NuggetShape()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 1, green: 0.82, blue: 0.38), JourneyTheme.energy, Color(red: 0.47, green: 0.24, blue: 0.08)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay { mineralVeins }
                        .padding(inset)
                        .shadow(color: JourneyTheme.energy.opacity(0.28), radius: 30, y: 14)

                    NuggetShape()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.025, green: 0.12, blue: 0.15), Color(red: 0.015, green: 0.04, blue: 0.07)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .padding(inset)
                        .mask(alignment: .leading) {
                            Rectangle().frame(width: inset + coreWidth * progress)
                        }

                    Capsule()
                        .fill(.white.opacity(0.82))
                        .frame(width: 2, height: 206)
                        .shadow(color: JourneyTheme.cyan, radius: reduceMotion ? 5 : 8 + sin(phase * 2.2) * 3)
                        .position(x: frontX, y: proxy.size.height * 0.48)

                    Circle()
                        .fill(JourneyTheme.cyan)
                        .frame(width: 16, height: 16)
                        .overlay { Circle().stroke(.white.opacity(0.8), lineWidth: 2) }
                        .shadow(color: JourneyTheme.cyan, radius: 12)
                        .position(x: frontX, y: proxy.size.height * 0.78)

                    milestones(width: coreWidth, inset: inset)
                        .position(x: proxy.size.width / 2, y: proxy.size.height - 27)
                }
                .clipShape(.rect(cornerRadius: 32))
                .overlay { RoundedRectangle(cornerRadius: 32).stroke(.white.opacity(0.11)) }
            }
        }
        .accessibilityLabel("Deposit \(progress.formatted(.percent)) extracted")
    }

    private var mineralVeins: some View {
        ZStack {
            ForEach(0..<5, id: \.self) { index in
                Capsule()
                    .stroke(.white.opacity(0.12), lineWidth: 1)
                    .frame(width: 190 + CGFloat(index * 18), height: 62 + CGFloat(index * 24))
                    .rotationEffect(.degrees(Double(index * 7 - 14)))
            }
        }
        .clipShape(NuggetShape())
    }

    private func milestones(width: CGFloat, inset: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach([0, 25, 50, 75, 100], id: \.self) { value in
                VStack(spacing: 5) {
                    Circle()
                        .fill(progress * 100 >= Double(value) ? JourneyTheme.cyan : Color.white.opacity(0.16))
                        .frame(width: 5, height: 5)
                    Text("\(value)").font(.caption2.monospacedDigit()).foregroundStyle(.white.opacity(0.38))
                }
                if value != 100 { Spacer() }
            }
        }
        .frame(width: width - 20)
    }
}

private struct NuggetShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.width * 0.08, y: rect.height * 0.34))
        path.addCurve(to: CGPoint(x: rect.width * 0.3, y: rect.height * 0.08), control1: CGPoint(x: rect.width * 0.1, y: rect.height * 0.13), control2: CGPoint(x: rect.width * 0.2, y: rect.height * 0.08))
        path.addCurve(to: CGPoint(x: rect.width * 0.62, y: rect.height * 0.12), control1: CGPoint(x: rect.width * 0.42, y: 0), control2: CGPoint(x: rect.width * 0.52, y: rect.height * 0.15))
        path.addCurve(to: CGPoint(x: rect.width * 0.94, y: rect.height * 0.4), control1: CGPoint(x: rect.width * 0.8, y: rect.height * 0.05), control2: CGPoint(x: rect.width * 0.94, y: rect.height * 0.2))
        path.addCurve(to: CGPoint(x: rect.width * 0.78, y: rect.height * 0.88), control1: CGPoint(x: rect.width, y: rect.height * 0.62), control2: CGPoint(x: rect.width * 0.9, y: rect.height * 0.84))
        path.addCurve(to: CGPoint(x: rect.width * 0.38, y: rect.height * 0.92), control1: CGPoint(x: rect.width * 0.62, y: rect.height), control2: CGPoint(x: rect.width * 0.5, y: rect.height * 0.86))
        path.addCurve(
            to: CGPoint(x: rect.width * 0.08, y: rect.height * 0.34),
            control1: CGPoint(x: rect.width * 0.2, y: rect.height),
            control2: CGPoint(x: 0, y: rect.height * 0.68)
        )
        path.closeSubpath()
        return path
    }
}
