import SwiftUI

struct HealthScreen: View {
    @State private var health = HealthKitManager()

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    intro
                    if health.isLoading { ProgressView("Reading Health data…").frame(maxWidth: .infinity).padding(30) }
                    if !health.metrics.isEmpty { dataSections }
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

    private var dataSections: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("AVAILABLE DATA").font(.caption.bold()).tracking(1.2).foregroundStyle(.secondary)
            ForEach(health.metrics) { metric in
                HStack(spacing: 14) {
                    Image(systemName: metric.icon)
                        .foregroundStyle(metric.value == nil ? .secondary : JourneyTheme.accent)
                        .frame(width: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(metric.title).font(.headline)
                        if let source = metric.source {
                            Text(source).font(.caption).foregroundStyle(.secondary)
                        } else if let date = metric.date {
                            Text(date.formatted(.dateTime.hour().minute())).font(.caption).foregroundStyle(.secondary)
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
}
