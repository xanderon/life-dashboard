import SwiftUI

struct RootView: View {
    @State private var selection = 0
    @State private var showingLog = false

    var body: some View {
        TabView(selection: $selection) {
            Tab("Home", systemImage: "house", value: 0) {
                NavigationStack { HomeView() }
            }
            Tab("Progress", systemImage: "chart.line.uptrend.xyaxis", value: 1) {
                NavigationStack { ProgressScreen() }
            }
            Tab("Review", systemImage: "calendar.badge.checkmark", value: 2) {
                NavigationStack { ReviewScreen() }
            }
            Tab("Profile", systemImage: "person.crop.circle", value: 3) {
                NavigationStack { ProfileScreen() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tint(JourneyTheme.accent)
        .tabViewBottomAccessory {
            if selection == 0 {
                Button { showingLog = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus")
                        Text("Add today").fontWeight(.semibold)
                        Spacer()
                        Text("Weight")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .tint(JourneyTheme.accent)
            }
        }
        .sheet(isPresented: $showingLog) { AddTodaySheet() }
    }
}
