import SwiftUI

enum JourneyTheme {
    static let accent = Color(red: 0.29, green: 0.32, blue: 0.92)
    static let cyan = Color(red: 0.28, green: 0.68, blue: 0.98)
    static let warm = Color(red: 0.43, green: 0.30, blue: 0.94)
    static let energy = Color(red: 0.91, green: 0.57, blue: 0.16)
    static let energyHighlight = Color(red: 1.0, green: 0.79, blue: 0.34)
    static let ink = Color(red: 0.035, green: 0.065, blue: 0.11)
}

struct CutCoachBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        LinearGradient(
            colors: scheme == .dark
                ? [JourneyTheme.ink, Color(red: 0.05, green: 0.11, blue: 0.16)]
                : [Color(.systemBackground), JourneyTheme.cyan.opacity(0.055)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

extension Double {
    var weightText: String { formatted(.number.precision(.fractionLength(1))) }
}
