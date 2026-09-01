import SwiftUI

enum JourneyTheme {
    static let accent = Color(red: 0.18, green: 0.72, blue: 0.64)
    static let cyan = Color(red: 0.28, green: 0.72, blue: 0.94)
    static let warm = Color(red: 0.93, green: 0.66, blue: 0.30)
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
