import SwiftUI

struct RootView: View {
    @State private var selection = 0
    @State private var showingLog = false

    var body: some View {
        TabView(selection: $selection) {
            Tab("Home", systemImage: "house", value: 0) {
                NavigationStack { HomeView(showingLog: $showingLog) }
            }
            Tab("Progress", systemImage: "chart.line.uptrend.xyaxis", value: 1) {
                NavigationStack { ProgressScreen() }
            }
            Tab("Review", systemImage: "calendar.badge.checkmark", value: 2) {
                NavigationStack { ReviewScreen() }
            }
            Tab("Health", systemImage: "heart.text.square", value: 3) {
                NavigationStack { HealthScreen() }
            }
            Tab("Profile", systemImage: "person.crop.circle", value: 4) {
                NavigationStack { ProfileScreen() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tint(JourneyTheme.accent)
        .sheet(isPresented: $showingLog) { AddTodaySheet() }
    }
}
