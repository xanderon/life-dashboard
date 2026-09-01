import Foundation
import Observation

@MainActor
@Observable
final class JourneyStore {
    private let defaults: UserDefaults
    private let profileKey = "journey.profile.v1"
    private let entriesKey = "journey.entries.v1"

    var profile: JourneyProfile { didSet { persist() } }
    var entries: [DailyEntry] { didSet { persist() } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        profile = Self.decode(JourneyProfile.self, key: profileKey, defaults: defaults) ?? JourneyProfile()
        entries = Self.decode([DailyEntry].self, key: entriesKey, defaults: defaults) ?? Self.previewEntries()
    }

    var sortedEntries: [DailyEntry] { entries.sorted { $0.date < $1.date } }
    var weightEntries: [DailyEntry] { sortedEntries.filter { $0.weight != nil } }
    var currentWeight: Double { weightEntries.last?.weight ?? profile.startWeight }
    var lostWeight: Double { max(0, profile.startWeight - currentWeight) }
    var remainingWeight: Double { max(0, currentWeight - profile.targetWeight) }
    var totalWeight: Double { max(0.1, profile.startWeight - profile.targetWeight) }
    var progress: Double { min(1, max(0, lostWeight / totalWeight)) }
    var totalEnergy: Double { totalWeight * 7700 }
    var energyRemaining: Double { totalEnergy * (1 - progress) }
    var energyCompleted: Double { totalEnergy - energyRemaining }

    func save(_ entry: DailyEntry) {
        let day = Calendar.current.startOfDay(for: entry.date)
        if let index = entries.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: day) }) {
            entries[index] = entry
        } else {
            entries.append(entry)
        }
    }

    func entry(on date: Date) -> DailyEntry? {
        entries.first { Calendar.current.isDate($0.date, inSameDayAs: date) }
    }

    func trendPoints(range: ChartRange) -> [TrendPoint] {
        let weighted = weightEntries
        let visible: [DailyEntry]
        if let days = range.days, let latest = weighted.last?.date,
           let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: latest) {
            visible = weighted.filter { $0.date >= cutoff }
        } else { visible = weighted }

        return visible.enumerated().compactMap { index, entry in
            guard let weight = entry.weight else { return nil }
            let lower = max(0, index - 6)
            let slice = visible[lower...index].compactMap(\.weight)
            let average = slice.count >= 3 ? slice.reduce(0, +) / Double(slice.count) : nil
            return TrendPoint(id: entry.date, date: entry.date, weight: weight, average: average)
        }
    }

    var weeklyChange: Double? {
        let points = weightEntries.suffix(14).compactMap(\.weight)
        guard points.count >= 5, let first = points.first, let last = points.last else { return nil }
        return last - first
    }

    var verdict: ReviewVerdict {
        guard weightEntries.count >= 7 else { return .needMoreData }
        guard let change = weeklyChange else { return .needMoreData }
        return change < -0.2 ? .keepPlan : .smallAdjustment
    }

    private func persist() {
        defaults.set(try? JSONEncoder().encode(profile), forKey: profileKey)
        defaults.set(try? JSONEncoder().encode(entries), forKey: entriesKey)
    }

    private static func decode<T: Decodable>(_ type: T.Type, key: String, defaults: UserDefaults) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func previewEntries() -> [DailyEntry] {
        let values = [100.0, 99.7, 99.4, 99.6, 99.0, 98.7, 98.4, 98.1, 97.8, 97.9, 97.4, 97.0, 96.7, 96.3, 95.9, 95.6, 95.2, 94.8]
        return values.enumerated().map { index, weight in
            DailyEntry(date: Calendar.current.date(byAdding: .day, value: index - values.count + 1, to: .now) ?? .now, weight: weight, calories: index > 10 ? 2200 + (index % 4) * 75 : nil)
        }
    }
}
