import SwiftUI

@main
struct WeightJourneyApp: App {
    @State private var store = JourneyStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(store.profile.appearance.colorScheme)
        }
    }
}
