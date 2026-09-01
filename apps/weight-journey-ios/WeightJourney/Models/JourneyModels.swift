import SwiftUI

struct JourneyProfile: Codable, Equatable {
    var startWeight = 100.0
    var targetWeight = 85.0
    var height = 186.0
    var startDate = Calendar.current.date(byAdding: .month, value: -2, to: .now) ?? .now
    var targetMonths = 8
    var calorieTarget = 2350
    var proteinMinimum = 130
    var proteinMaximum = 160
    var showEnergy = true
    var showCalories = true
    var weighInReminder = true
    var reviewReminder = true
    var appearance: AppAppearance = .system
}

enum AppAppearance: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: Self { self }
    var title: String { rawValue.capitalized }
    var colorScheme: ColorScheme? {
        switch self { case .system: nil; case .light: .light; case .dark: .dark }
    }
}

struct DailyEntry: Codable, Identifiable, Equatable {
    var id = UUID()
    var date: Date
    var weight: Double?
    var calories: Int?
    var note: String = ""
}

enum ChartRange: String, CaseIterable, Identifiable {
    case month = "1M", quarter = "3M", halfYear = "6M", all = "All"
    var id: Self { self }
    var days: Int? {
        switch self { case .month: 31; case .quarter: 93; case .halfYear: 186; case .all: nil }
    }
}

struct TrendPoint: Identifiable {
    let id: Date
    let date: Date
    let weight: Double
    let average: Double?
}

enum ReviewVerdict {
    case keepPlan, smallAdjustment, needMoreData

    var title: String {
        switch self { case .keepPlan: "KEEP THE PLAN"; case .smallAdjustment: "SMALL ADJUSTMENT"; case .needMoreData: "NEED MORE DATA" }
    }
    var message: String {
        switch self {
        case .keepPlan: "Your trend is moving in the right direction. Keep going."
        case .smallAdjustment: "Your trend is calm. Review consistency before changing the target."
        case .needMoreData: "A few more morning measurements will make the trend useful."
        }
    }
}
