import SwiftUI

enum JourneyTheme {
    static let accent = Color(red: 0.29, green: 0.32, blue: 0.92)
    static let cyan = Color(red: 0.28, green: 0.68, blue: 0.98)
    static let warm = Color(red: 0.43, green: 0.30, blue: 0.94)
    static let energy = Color(red: 0.91, green: 0.57, blue: 0.16)
    static let energyHighlight = Color(red: 1.0, green: 0.79, blue: 0.34)
    static let ink = Color(red: 0.035, green: 0.065, blue: 0.11)
    static let surfaceRadius: CGFloat = 28
}

struct CutCoachBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            LinearGradient(
                colors: scheme == .dark
                    ? [JourneyTheme.ink, Color(red: 0.07, green: 0.08, blue: 0.18), Color(red: 0.04, green: 0.12, blue: 0.16)]
                    : [Color(.systemBackground), JourneyTheme.cyan.opacity(0.09), JourneyTheme.warm.opacity(0.06)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(JourneyTheme.accent.opacity(scheme == .dark ? 0.16 : 0.07))
                .blur(radius: 90)
                .frame(width: 320)
                .offset(x: 150, y: -260)
        }
        .ignoresSafeArea()
    }
}

struct JourneySurface<Content: View>: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    let content: Content

    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        content
            .padding(20)
            .background {
                RoundedRectangle(cornerRadius: JourneyTheme.surfaceRadius, style: .continuous)
                    .fill(reduceTransparency ? Color(.secondarySystemBackground) : Color.primary.opacity(0.055))
                    .overlay {
                        RoundedRectangle(cornerRadius: JourneyTheme.surfaceRadius, style: .continuous)
                            .stroke(.white.opacity(contrast == .increased ? 0.35 : 0.14), lineWidth: 1)
                    }
                    .shadow(color: .black.opacity(0.08), radius: 24, y: 12)
            }
    }
}

extension Double {
    var weightText: String { formatted(.number.precision(.fractionLength(1))) }
}
