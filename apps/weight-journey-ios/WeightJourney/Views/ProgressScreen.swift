import Charts
import SwiftUI

struct ProgressScreen: View {
    @Environment(JourneyStore.self) private var store
    @State private var range = ChartRange.quarter

    private var points: [TrendPoint] { store.trendPoints(range: range) }

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    Picker("Range", selection: $range) {
                        ForEach(ChartRange.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    chart
                    pace
                    milestones
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
        }
        .navigationTitle("Progress")
        .navigationBarTitleDisplayMode(.large)
    }

    private var chart: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading) {
                    Text("Weight trend").font(.title2.bold())
                    Text("The smooth line is the signal.").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(store.currentWeight.weightText) kg").font(.headline.monospacedDigit())
            }
            Chart(points) { point in
                LineMark(x: .value("Date", point.date), y: .value("Daily", point.weight))
                    .foregroundStyle(.secondary.opacity(0.3))
                    .lineStyle(.init(lineWidth: 1))
                PointMark(x: .value("Date", point.date), y: .value("Daily", point.weight))
                    .foregroundStyle(.secondary.opacity(0.35))
                    .symbolSize(16)
                if let average = point.average {
                    LineMark(x: .value("Date", point.date), y: .value("7-day", average))
                        .foregroundStyle(JourneyTheme.accent)
                        .lineStyle(.init(lineWidth: 4, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.catmullRom)
                }
                RuleMark(y: .value("Goal", store.profile.targetWeight))
                    .foregroundStyle(JourneyTheme.warm.opacity(0.7))
                    .lineStyle(.init(lineWidth: 1, dash: [5, 5]))
                    .annotation(position: .top, alignment: .trailing) { Text("85 goal").font(.caption2).foregroundStyle(.secondary) }
            }
            .chartYAxis { AxisMarks(position: .leading) }
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { AxisGridLine(); AxisValueLabel(format: .dateTime.month(.abbreviated).day()) } }
            .frame(height: 310)
            .accessibilityLabel("Weight chart showing daily weight and seven day average")
        }
    }

    private var pace: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("PACE", systemImage: "gauge.with.dots.needle.50percent")
                .font(.caption.bold()).tracking(1.3).foregroundStyle(JourneyTheme.accent)
            HStack {
                paceMetric("Planned", "−0.55 kg / week")
                Spacer()
                paceMetric("Actual", actualPace)
            }
            Divider()
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Estimated window").font(.subheadline).foregroundStyle(.secondary)
                    Text("March – April 2027").font(.title3.bold())
                }
                Spacer()
                Text(store.verdict == .needMoreData ? "Needs data" : "On track")
                    .font(.caption.bold()).padding(.horizontal, 11).padding(.vertical, 7)
                    .background(JourneyTheme.accent.opacity(0.15), in: .capsule)
            }
            Text("Based on your longer trend, never one daily fluctuation.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(20)
        .background(.regularMaterial, in: .rect(cornerRadius: 24))
    }

    private var actualPace: String {
        guard let change = store.weeklyChange else { return "Not enough data" }
        return "\(change.formatted(.number.precision(.fractionLength(2)))) kg / week"
    }

    private func paceMetric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline.monospacedDigit())
        }
    }

    private var milestones: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Milestones").font(.title2.bold())
            ForEach([100.0, 95, 90, 85], id: \.self) { value in
                HStack {
                    Image(systemName: store.currentWeight <= value ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(store.currentWeight <= value ? JourneyTheme.accent : .secondary)
                    Text(value == 100 ? "Start" : value == 85 ? "Goal" : "Checkpoint")
                    Spacer()
                    Text("\(value.weightText) kg").font(.headline.monospacedDigit())
                }
            }
        }
    }
}
