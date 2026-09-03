import SwiftUI

struct HealthScreen: View {
    @Environment(HealthKitManager.self) private var health
    @State private var historyDays = 14

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    intro
                    if health.isLoading { ProgressView("Reading Health data…").frame(maxWidth: .infinity).padding(30) }
                    if !health.metrics.isEmpty {
                        todaySection
                        historySection
                        weightHistorySection
                    }
                    if let error = health.errorMessage {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
        }
        .navigationTitle("Health")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await health.refresh() }
    }

    private var intro: some View {
        JourneySurface {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "heart.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.pink.gradient)
                Text("Your Health data").font(.title2.bold())
                Text("Read weight and today's nutrition totals saved by Lifesum and other Health sources.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button(health.metrics.isEmpty ? "Connect Health" : "Refresh", systemImage: "heart.text.square") {
                    Task { await health.requestAndLoad() }
                }
                .buttonStyle(.glassProminent)
                .tint(JourneyTheme.accent)
                .disabled(health.isLoading || !health.isAvailable)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("TODAY + LATEST").font(.caption.bold()).tracking(1.2).foregroundStyle(.secondary)
            ForEach(health.metrics) { metric in
                HStack(spacing: 14) {
                    Image(systemName: metric.icon)
                        .foregroundStyle(metric.value == nil ? .secondary : JourneyTheme.accent)
                        .frame(width: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(metric.title).font(.headline)
                        if let source = metric.source {
                            Text(source).font(.caption).foregroundStyle(.secondary)
                        } else if metric.date != nil {
                            Text("Today total").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(metric.valueText).font(.headline.monospacedDigit())
                        if metric.value != nil { Text(metric.unit).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                .padding(.vertical, 4)
                Divider().opacity(metric.id == health.metrics.last?.id ? 0 : 1)
            }
        }
        .padding(20)
        .background(Color.primary.opacity(0.05), in: .rect(cornerRadius: JourneyTheme.surfaceRadius))
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Nutrition history").font(.title2.bold())
                    Text("Daily totals found in Apple Health").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }

            Picker("History", selection: $historyDays) {
                Text("7D").tag(7)
                Text("14D").tag(14)
                Text("30D").tag(30)
            }
            .pickerStyle(.segmented)

            ScrollView(.horizontal, showsIndicators: false) {
                VStack(spacing: 0) {
                    nutritionRow(date: "DATE", energy: "KCAL", protein: "P", carbs: "C", fat: "F", isHeader: true)
                    ForEach(health.dailyHistory.prefix(historyDays)) { day in
                        Divider()
                        nutritionRow(
                            date: day.date.formatted(.dateTime.day().month(.abbreviated)),
                            energy: number(day.energy),
                            protein: number(day.protein),
                            carbs: number(day.carbohydrates),
                            fat: number(day.fat),
                            isHeader: false
                        )
                        .opacity(day.hasNutrition ? 1 : 0.42)
                    }
                }
                .padding(16)
            }
            .background(Color.primary.opacity(0.05), in: .rect(cornerRadius: JourneyTheme.surfaceRadius))

            Text("P, C and F are protein, carbohydrates and fat in grams. A dash means Health contains no sample for that day.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var weightHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Weight samples").font(.title2.bold())
            if health.weightHistory.isEmpty {
                Text("No weight samples found in the last 30 days.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(health.weightHistory) { entry in
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.date.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                                    .font(.subheadline.weight(.medium))
                                Text(entry.source).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(entry.weight.weightText) kg").font(.headline.monospacedDigit())
                        }
                        .padding(.vertical, 12)
                        if entry.id != health.weightHistory.last?.id { Divider() }
                    }
                }
                .padding(.horizontal, 18)
                .background(Color.primary.opacity(0.05), in: .rect(cornerRadius: JourneyTheme.surfaceRadius))
            }
        }
    }

    private func nutritionRow(
        date: String,
        energy: String,
        protein: String,
        carbs: String,
        fat: String,
        isHeader: Bool
    ) -> some View {
        HStack(spacing: 12) {
            Text(date).frame(width: 72, alignment: .leading)
            Text(energy).frame(width: 58, alignment: .trailing)
            Text(protein).frame(width: 46, alignment: .trailing)
            Text(carbs).frame(width: 46, alignment: .trailing)
            Text(fat).frame(width: 46, alignment: .trailing)
        }
        .font(isHeader ? .caption2.bold() : .subheadline.monospacedDigit())
        .foregroundStyle(isHeader ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
        .padding(.vertical, 10)
    }

    private func number(_ value: Double?) -> String {
        value?.formatted(.number.precision(.fractionLength(0))) ?? "—"
    }
}
