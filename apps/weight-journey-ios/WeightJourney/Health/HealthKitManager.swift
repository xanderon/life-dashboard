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

@MainActor
@Observable
final class HealthKitManager {
    private let store = HKHealthStore()
    private(set) var metrics: [HealthMetric] = []
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
        guard hasRequestedAccess else { return }
        isLoading = true
        defer { isLoading = false }
        do { try await load() } catch { errorMessage = error.localizedDescription }
    }

    private func load() async throws {
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
}
