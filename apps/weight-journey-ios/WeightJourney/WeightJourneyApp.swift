import SwiftUI

@main
struct WeightJourneyApp: App {
    @State private var store = JourneyStore()
    @State private var health = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(health)
                .preferredColorScheme(store.profile.appearance.colorScheme)
                .task { await health.refresh() }
        }
    }
}
