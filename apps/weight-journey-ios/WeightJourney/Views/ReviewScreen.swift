import SwiftUI

struct ReviewScreen: View {
    @Environment(JourneyStore.self) private var store

    var body: some View {
        ZStack {
            CutCoachBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    recommendation
                    explanation
                    recentDays
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
        }
        .navigationTitle("Weekly Review")
        .navigationBarTitleDisplayMode(.large)
    }

    private var recommendation: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("WEEKLY RECOMMENDATION").font(.caption.bold()).tracking(1.4).foregroundStyle(.secondary)
            Image(systemName: verdictIcon).font(.system(size: 40, weight: .light)).foregroundStyle(JourneyTheme.accent)
            Text(store.verdict.title).font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text(store.verdict.message).font(.title3).foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    private var explanation: some View {
        VStack(spacing: 0) {
            reviewRow("Current", "\(store.currentWeight.weightText) kg")
            Divider().padding(.leading, 44)
            reviewRow("Change", store.weeklyChange.map { "\($0.formatted(.number.precision(.fractionLength(2)))) kg" } ?? "Building trend")
            Divider().padding(.leading, 44)
            reviewRow("Logged", "\(store.weightEntries.suffix(7).count) of 7 days")
        }
        .padding(.vertical, 6)
        .background(.regularMaterial, in: .rect(cornerRadius: 22))
    }

    private func reviewRow(_ title: String, _ value: String) -> some View {
        HStack {
            Image(systemName: title == "Current" ? "scalemass" : title == "Change" ? "chart.line.downtrend.xyaxis" : "calendar.badge.checkmark")
                .frame(width: 28).foregroundStyle(JourneyTheme.accent)
            Text(title)
            Spacer()
            Text(value).fontWeight(.semibold).monospacedDigit()
        }
        .padding(16)
    }

    private var recentDays: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("This week").font(.title2.bold())
            HStack(spacing: 8) {
                ForEach(0..<7, id: \.self) { offset in
                    let date = Calendar.current.date(byAdding: .day, value: offset - 6, to: .now) ?? .now
                    let logged = store.entry(on: date)?.weight != nil
                    VStack(spacing: 7) {
                        Text(date.formatted(.dateTime.weekday(.narrow))).font(.caption2.bold()).foregroundStyle(.secondary)
                        Circle().fill(logged ? JourneyTheme.accent : Color.secondary.opacity(0.22)).frame(width: 12, height: 12)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Text("Daily fluctuations are normal. Your overall direction is what the review protects.")
                .font(.subheadline).foregroundStyle(.secondary).padding(.top, 6)
        }
    }

    private var verdictIcon: String {
        switch store.verdict { case .keepPlan: "checkmark.seal"; case .smallAdjustment: "slider.horizontal.3"; case .needMoreData: "ellipsis.circle" }
    }
}
