import SwiftUI

struct CodeScreen: View {
    var body: some View {
        List {
            Section {
                Label("100 → 85 kg", systemImage: "point.bottomleft.forward.to.point.topright.scurvepath")
                Text("The journey is calculated from actual weight, with visual progress clamped between 0% and 100%.")
            } header: { Text("Journey engine") }

            Section {
                codeCard("Progress", code: "(start − current) / (start − goal)")
                codeCard("Energy estimate", code: "remaining kg × 7,700 kcal")
                Text("The energy number is motivational, not a physiological or body-fat measurement.")
                    .font(.footnote).foregroundStyle(.secondary)
            } header: { Text("Formulas") }

            Section {
                Label("SwiftUI", systemImage: "swift")
                Label("Swift Charts", systemImage: "chart.xyaxis.line")
                Label("Local Codable store", systemImage: "externaldrive")
                Text("Views only read the JourneyStore API. A remote sync layer can replace local persistence without redesigning the screens.")
                    .font(.footnote).foregroundStyle(.secondary)
            } header: { Text("Implementation") }

            Section {
                Text("Current weight remains the source of truth. The seven-day average reduces water-weight noise. Weekly recommendations wait for enough measurements before suggesting change.")
            } header: { Text("Decision rules") }
        }
        .navigationTitle("How it works")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func codeCard(_ title: String, code: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(code).font(.system(.body, design: .monospaced)).foregroundStyle(JourneyTheme.accent)
        }
        .padding(.vertical, 4)
    }
}
