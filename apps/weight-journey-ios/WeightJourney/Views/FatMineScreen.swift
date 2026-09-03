import SwiftUI

struct FatMineScreen: View {
    @Environment(JourneyStore.self) private var store
    @Environment(HealthKitManager.self) private var health
    @State private var showingRules = false

    var body: some View {
        ZStack {
            gameBackground
            ScrollView {
                VStack(spacing: 24) {
                    GameHUD(extracted: store.lostWeight, remaining: store.remainingWeight)
                    MiningProcessScene(
                        progress: store.progress,
                        remaining: store.remainingWeight,
                        extracted: store.lostWeight,
                        yesterdayReward: yesterday?.minedGrams
                    )
                    .frame(height: 430)

                    if let yesterday { YesterdayReceipt(day: yesterday) }
                    SevenDayVault(days: recentDays)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 38)
            }
        }
        .navigationTitle("The Mine")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Mining rules", systemImage: "info") { showingRules = true }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
            }
        }
        .alert("How mining works", isPresented: $showingRules) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("The deposit follows your weight journey. Closed days use dietary energy from Apple Health; estimated deficit is converted to grams at 7.7 kcal per gram. Today never pays out early.")
        }
        .task { await health.refresh() }
    }

    private var gameBackground: some View {
        ZStack {
            Color(red: 0.018, green: 0.025, blue: 0.055)
            RadialGradient(colors: [JourneyTheme.warm.opacity(0.2), .clear], center: .topTrailing, startRadius: 10, endRadius: 360)
            RadialGradient(colors: [JourneyTheme.cyan.opacity(0.13), .clear], center: .bottomLeading, startRadius: 10, endRadius: 340)
        }
        .ignoresSafeArea()
    }

    private var maintenanceEstimate: Double {
        let days = max(30, Double(store.profile.targetMonths) * 30.4375)
        return Double(store.profile.calorieTarget) + store.totalEnergy / days
    }

    private var recentDays: [MiningDay] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        return (1...7).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let healthCalories = health.dailyHistory.first { calendar.isDate($0.date, inSameDayAs: date) }?.energy
            let localCalories = store.entry(on: date)?.calories.map(Double.init)
            let calories = healthCalories ?? localCalories
            guard let calories, calories > 0 else {
                return MiningDay(date: date, calories: nil, deficit: nil, minedGrams: nil)
            }
            let deficit = max(0, maintenanceEstimate - calories)
            return MiningDay(date: date, calories: calories, deficit: deficit, minedGrams: deficit / 7.7)
        }.reversed()
    }

    private var yesterday: MiningDay? { recentDays.last }
}

private struct MiningDay: Identifiable {
    let date: Date
    let calories: Double?
    let deficit: Double?
    let minedGrams: Double?
    var id: Date { date }
}

private struct GameHUD: View {
    let extracted: Double
    let remaining: Double

    var body: some View {
        HStack(spacing: 10) {
            hudItem(icon: "shippingbox.fill", value: "\(extracted.weightText) kg", label: "VAULT", color: JourneyTheme.cyan)
            hudItem(icon: "hexagon.fill", value: "\(remaining.weightText) kg", label: "DEPOSIT", color: JourneyTheme.energyHighlight)
        }
    }

    private func hudItem(icon: String, value: String, label: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(.headline.monospacedDigit()).foregroundStyle(.white)
                Text(label).font(.caption2.bold()).tracking(1).foregroundStyle(.white.opacity(0.42))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.white.opacity(0.065), in: .rect(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.1)) }
    }
}

private struct MiningProcessScene: View {
    let progress: Double
    let remaining: Double
    let extracted: Double
    let yesterdayReward: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 1 : 1 / 30, paused: reduceMotion)) { timeline in
            GeometryReader { proxy in
                let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                ZStack {
                    sceneGrid
                    connectorPath(phase: phase, size: proxy.size)
                    deposit(progress: progress, phase: phase)
                        .position(x: proxy.size.width * 0.68, y: 135)
                    refinery(phase: phase)
                        .position(x: proxy.size.width * 0.25, y: 255)
                    vault
                        .position(x: proxy.size.width * 0.72, y: 340)
                    movingOre(phase: phase, size: proxy.size)
                }
                .clipShape(.rect(cornerRadius: 34))
                .overlay { RoundedRectangle(cornerRadius: 34).stroke(.white.opacity(0.12)) }
            }
        }
        .accessibilityLabel("\(remaining.weightText) kilograms remain and \(extracted.weightText) kilograms are extracted")
    }

    private var sceneGrid: some View {
        Canvas { context, size in
            for x in stride(from: 0.0, through: size.width, by: 28) {
                var line = Path(); line.move(to: CGPoint(x: x, y: 0)); line.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(line, with: .color(.white.opacity(0.025)), lineWidth: 1)
            }
            for y in stride(from: 0.0, through: size.height, by: 28) {
                var line = Path(); line.move(to: CGPoint(x: 0, y: y)); line.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(line, with: .color(.white.opacity(0.025)), lineWidth: 1)
            }
        }
        .background(.black.opacity(0.18))
    }

    private func deposit(progress: Double, phase: Double) -> some View {
        ZStack {
            Circle()
                .fill(AngularGradient(colors: [JourneyTheme.energy, JourneyTheme.energyHighlight, .orange, JourneyTheme.energy], center: .center))
                .frame(width: 190, height: 190)
                .overlay {
                    ForEach(0..<3, id: \.self) { index in
                        Circle().stroke(.white.opacity(0.12), lineWidth: 1).padding(CGFloat(20 + index * 22))
                    }
                }
                .shadow(color: JourneyTheme.energy.opacity(0.28), radius: 30)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color(red: 0.02, green: 0.09, blue: 0.12), style: StrokeStyle(lineWidth: 62, lineCap: .butt))
                .frame(width: 158, height: 158)
                .rotationEffect(.degrees(-90))

            Circle()
                .trim(from: max(0, progress - 0.008), to: min(1, progress + 0.008))
                .stroke(JourneyTheme.cyan, style: StrokeStyle(lineWidth: 68, lineCap: .round))
                .frame(width: 158, height: 158)
                .rotationEffect(.degrees(-90))
                .shadow(color: JourneyTheme.cyan, radius: reduceMotion ? 7 : 9 + sin(phase * 2.4) * 3)

            VStack(spacing: 1) {
                Text("\(remaining.weightText)").font(.system(size: 35, weight: .bold, design: .rounded)).monospacedDigit()
                Text("KG LEFT").font(.caption2.bold()).tracking(1.3)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.45), radius: 5)
        }
    }

    private func refinery(phase: Double) -> some View {
        ZStack {
            Circle().fill(.white.opacity(0.08)).frame(width: 94, height: 94)
            Circle().stroke(JourneyTheme.cyan.opacity(0.5), style: StrokeStyle(lineWidth: 2, dash: [4, 7]))
                .frame(width: 78, height: 78)
                .rotationEffect(.degrees(phase * 35))
            Image(systemName: "gearshape.2.fill")
                .font(.system(size: 34))
                .foregroundStyle(JourneyTheme.cyan)
                .rotationEffect(.degrees(reduceMotion ? 0 : phase * 24))
        }
        .overlay(alignment: .bottom) {
            Text("REFINERY").font(.caption2.bold()).tracking(1.2).foregroundStyle(.white.opacity(0.52)).offset(y: 24)
        }
    }

    private var vault: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18).fill(.white.opacity(0.07)).frame(width: 132, height: 82)
            HStack(spacing: 5) {
                ForEach(0..<4, id: \.self) { index in
                    CrystalShape().fill(index < max(1, Int(progress * 4)) ? JourneyTheme.cyan.gradient : Color.white.opacity(0.08).gradient)
                        .frame(width: 18, height: 32 + CGFloat(index % 2) * 10)
                }
            }
            VStack {
                Spacer()
                Text(yesterdayReward.map { "+\(Int($0)) g" } ?? "WAITING")
                    .font(.caption2.bold().monospacedDigit())
                    .foregroundStyle(yesterdayReward == nil ? .white.opacity(0.38) : JourneyTheme.cyan)
                    .offset(y: 23)
            }
        }
    }

    private func connectorPath(phase: Double, size: CGSize) -> some View {
        Canvas { context, _ in
            var path = Path()
            path.move(to: CGPoint(x: size.width * 0.57, y: 188))
            path.addCurve(to: CGPoint(x: size.width * 0.3, y: 225), control1: CGPoint(x: size.width * 0.5, y: 225), control2: CGPoint(x: size.width * 0.39, y: 205))
            path.addCurve(to: CGPoint(x: size.width * 0.61, y: 332), control1: CGPoint(x: size.width * 0.23, y: 315), control2: CGPoint(x: size.width * 0.48, y: 300))
            context.stroke(path, with: .color(.white.opacity(0.12)), style: StrokeStyle(lineWidth: 3, dash: [3, 8]))
        }
    }

    private func movingOre(phase: Double, size: CGSize) -> some View {
        ForEach(0..<4, id: \.self) { index in
            let travel = (phase * 0.18 + Double(index) / 4).truncatingRemainder(dividingBy: 1)
            Circle()
                .fill(LinearGradient(colors: [JourneyTheme.energyHighlight, JourneyTheme.cyan], startPoint: .top, endPoint: .bottom))
                .frame(width: 7, height: 7)
                .shadow(color: JourneyTheme.cyan, radius: 5)
                .position(
                    x: size.width * (0.57 - 0.3 * sin(travel * .pi) + 0.05 * travel),
                    y: 188 + travel * 146
                )
                .opacity(reduceMotion ? 0 : sin(travel * .pi))
        }
    }
}

private struct YesterdayReceipt: View {
    let day: MiningDay

    var body: some View {
        HStack(spacing: 0) {
            receiptValue(icon: "fork.knife", value: day.calories.map { "\(Int($0))" } ?? "—", unit: "kcal")
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.white.opacity(0.25))
            receiptValue(icon: "bolt.fill", value: day.deficit.map { "\(Int($0))" } ?? "—", unit: "deficit")
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.white.opacity(0.25))
            receiptValue(icon: "diamond.fill", value: day.minedGrams.map { "\(Int($0))" } ?? "—", unit: "grams")
        }
        .padding(.vertical, 17)
        .background(.white.opacity(0.055), in: .rect(cornerRadius: 24))
        .overlay(alignment: .topLeading) {
            Text("YESTERDAY").font(.caption2.bold()).tracking(1.2).foregroundStyle(.white.opacity(0.42)).padding(14).offset(y: -38)
        }
    }

    private func receiptValue(icon: String, value: String, unit: String) -> some View {
        VStack(spacing: 5) {
            Image(systemName: icon).foregroundStyle(unit == "grams" ? JourneyTheme.cyan : JourneyTheme.energyHighlight)
            Text(value).font(.headline.monospacedDigit()).foregroundStyle(.white)
            Text(unit.uppercased()).font(.caption2.bold()).foregroundStyle(.white.opacity(0.38))
        }
        .frame(maxWidth: .infinity)
    }
}

private struct SevenDayVault: View {
    let days: [MiningDay]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("7 DAY VAULT").font(.caption.bold()).tracking(1.3).foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text("\(Int(days.compactMap(\.minedGrams).reduce(0, +))) g")
                    .font(.headline.monospacedDigit()).foregroundStyle(JourneyTheme.cyan)
            }
            HStack(spacing: 9) {
                ForEach(days) { day in
                    VStack(spacing: 7) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 9).fill(.white.opacity(0.055)).frame(height: 72)
                            if let grams = day.minedGrams {
                                CrystalShape()
                                    .fill(JourneyTheme.cyan.gradient)
                                    .frame(width: 24, height: min(62, 18 + grams / 8))
                                    .padding(.bottom, 5)
                            }
                        }
                        Text(day.date.formatted(.dateTime.weekday(.narrow)))
                            .font(.caption2.bold()).foregroundStyle(.white.opacity(0.4))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(18)
        .background(.white.opacity(0.04), in: .rect(cornerRadius: 24))
        .overlay { RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.08)) }
    }
}

private struct CrystalShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: 0))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.height * 0.35))
        path.addLine(to: CGPoint(x: rect.width * 0.76, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.width * 0.24, y: rect.maxY))
        path.addLine(to: CGPoint(x: 0, y: rect.height * 0.35))
        path.closeSubpath()
        return path
    }
}
