@preconcurrency import HealthKit
import Observation

struct HealthMetric: Identifiable {
    let id: String
    let title: String
    let value: Double?
    let unit: String
    let date: Date?
    let source: String?
    let icon: String

    var valueText: String {
        guard let value else { return "No data" }
        let precision = unit == "kg" || unit == "BMI" ? 1 : 0
        return value.formatted(.number.precision(.fractionLength(precision)))
    }
}

struct HealthDay: Identifiable {
    let date: Date
    let energy: Double?
    let protein: Double?
    let carbohydrates: Double?
    let fat: Double?
    var id: Date { date }
    var hasNutrition: Bool { energy != nil || protein != nil || carbohydrates != nil || fat != nil }
}

struct HealthWeightEntry: Identifiable {
    let date: Date
    let weight: Double
    let source: String
    var id: String { "\(date.timeIntervalSinceReferenceDate)-\(source)" }
}

@MainActor
@Observable
final class HealthKitManager {
    private let store = HKHealthStore()
    private(set) var metrics: [HealthMetric] = []
    private(set) var dailyHistory: [HealthDay] = []
    private(set) var weightHistory: [HealthWeightEntry] = []
    private(set) var isLoading = false
    private(set) var hasRequestedAccess = false
    var errorMessage: String?

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAndLoad() async {
        guard isAvailable else {
            errorMessage = "Health data is not available on this device."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            hasRequestedAccess = true
            try await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        guard isAvailable, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            try await load()
            hasRequestedAccess = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func load() async throws {
        async let history = loadDailyHistory()
        async let weights = loadWeightHistory()
        async let weight = latestMetric(.bodyMass, title: "Weight", unit: .gramUnit(with: .kilo), unitLabel: "kg", icon: "scalemass")
        async let bmi = latestMetric(.bodyMassIndex, title: "Body mass index", unit: .count(), unitLabel: "BMI", icon: "figure")
        async let energy = todayTotal(.dietaryEnergyConsumed, title: "Energy", unit: .kilocalorie(), unitLabel: "kcal", icon: "flame")
        async let protein = todayTotal(.dietaryProtein, title: "Protein", unit: .gram(), unitLabel: "g", icon: "leaf")
        async let carbs = todayTotal(.dietaryCarbohydrates, title: "Carbohydrates", unit: .gram(), unitLabel: "g", icon: "circle.hexagongrid")
        async let fat = todayTotal(.dietaryFatTotal, title: "Total fat", unit: .gram(), unitLabel: "g", icon: "drop")
        async let saturated = todayTotal(.dietaryFatSaturated, title: "Saturated fat", unit: .gram(), unitLabel: "g", icon: "drop.fill")
        async let sugar = todayTotal(.dietarySugar, title: "Sugar", unit: .gram(), unitLabel: "g", icon: "cube")
        async let fibre = todayTotal(.dietaryFiber, title: "Fibre", unit: .gram(), unitLabel: "g", icon: "tree")
        async let cholesterol = todayTotal(.dietaryCholesterol, title: "Cholesterol", unit: .gramUnit(with: .milli), unitLabel: "mg", icon: "heart.text.square")
        async let sodium = todayTotal(.dietarySodium, title: "Sodium", unit: .gramUnit(with: .milli), unitLabel: "mg", icon: "waveform.path")
        async let potassium = todayTotal(.dietaryPotassium, title: "Potassium", unit: .gramUnit(with: .milli), unitLabel: "mg", icon: "bolt")

        metrics = try await [weight, bmi, energy, protein, carbs, fat, saturated, sugar, fibre, cholesterol, sodium, potassium]
        dailyHistory = try await history
        weightHistory = try await weights
    }

    private var readTypes: Set<HKObjectType> {
        Set([
            .quantityType(forIdentifier: .bodyMass),
            .quantityType(forIdentifier: .bodyMassIndex),
            .quantityType(forIdentifier: .dietaryEnergyConsumed),
            .quantityType(forIdentifier: .dietaryProtein),
            .quantityType(forIdentifier: .dietaryCarbohydrates),
            .quantityType(forIdentifier: .dietaryFatTotal),
            .quantityType(forIdentifier: .dietaryFatSaturated),
            .quantityType(forIdentifier: .dietarySugar),
            .quantityType(forIdentifier: .dietaryFiber),
            .quantityType(forIdentifier: .dietaryCholesterol),
            .quantityType(forIdentifier: .dietarySodium),
            .quantityType(forIdentifier: .dietaryPotassium),
        ].compactMap { $0 })
    }

    private func latestMetric(
        _ identifier: HKQuantityTypeIdentifier,
        title: String,
        unit: HKUnit,
        unitLabel: String,
        icon: String
    ) async throws -> HealthMetric {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            return HealthMetric(id: identifier.rawValue, title: title, value: nil, unit: unitLabel, date: nil, source: nil, icon: icon)
        }
        let sample = try await latestSample(type)
        return HealthMetric(
            id: identifier.rawValue,
            title: title,
            value: sample?.quantity.doubleValue(for: unit),
            unit: unitLabel,
            date: sample?.endDate,
            source: sample?.sourceRevision.source.name,
            icon: icon
        )
    }

    private func todayTotal(
        _ identifier: HKQuantityTypeIdentifier,
        title: String,
        unit: HKUnit,
        unitLabel: String,
        icon: String
    ) async throws -> HealthMetric {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            return HealthMetric(id: identifier.rawValue, title: title, value: nil, unit: unitLabel, date: nil, source: nil, icon: icon)
        }
        let start = Calendar.current.startOfDay(for: .now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: .now)
        let sum = try await cumulativeSum(type: type, predicate: predicate)
        return HealthMetric(id: identifier.rawValue, title: title, value: sum?.doubleValue(for: unit), unit: unitLabel, date: sum == nil ? nil : .now, source: nil, icon: icon)
    }

    private func latestSample(_ type: HKQuantityType) async throws -> HKQuantitySample? {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: nil,
                limit: 1,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
            ) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: samples?.first as? HKQuantitySample) }
            }
            store.execute(query)
        }
    }

    private func cumulativeSum(type: HKQuantityType, predicate: NSPredicate) async throws -> HKQuantity? {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: result?.sumQuantity()) }
            }
            store.execute(query)
        }
    }

    private func loadDailyHistory() async throws -> [HealthDay] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let start = calendar.date(byAdding: .day, value: -29, to: today) ?? today

        async let energy = dailyValues(.dietaryEnergyConsumed, unit: .kilocalorie(), start: start)
        async let protein = dailyValues(.dietaryProtein, unit: .gram(), start: start)
        async let carbs = dailyValues(.dietaryCarbohydrates, unit: .gram(), start: start)
        async let fat = dailyValues(.dietaryFatTotal, unit: .gram(), start: start)
        let maps = try await (energy, protein, carbs, fat)

        return (0..<30).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            return HealthDay(
                date: date,
                energy: maps.0[date],
                protein: maps.1[date],
                carbohydrates: maps.2[date],
                fat: maps.3[date]
            )
        }
    }

    private func loadWeightHistory() async throws -> [HealthWeightEntry] {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return [] }
        let start = Calendar.current.date(byAdding: .day, value: -30, to: .now) ?? .distantPast
        return try await quantitySamples(type, start: start)
            .map {
                HealthWeightEntry(
                    date: $0.endDate,
                    weight: $0.quantity.doubleValue(for: .gramUnit(with: .kilo)),
                    source: $0.sourceRevision.source.name
                )
            }
            .sorted { $0.date > $1.date }
    }

    private func dailyValues(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date
    ) async throws -> [Date: Double] {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return [:] }
        let samples = try await quantitySamples(type, start: start)
        return Dictionary(grouping: samples, by: { Calendar.current.startOfDay(for: $0.endDate) })
            .mapValues { $0.reduce(0) { $0 + $1.quantity.doubleValue(for: unit) } }
    }

    private func quantitySamples(_ type: HKQuantityType, start: Date) async throws -> [HKQuantitySample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: .now)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: samples as? [HKQuantitySample] ?? []) }
            }
            store.execute(query)
        }
    }
}
