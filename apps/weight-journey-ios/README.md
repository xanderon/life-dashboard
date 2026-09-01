# Weight Journey for iOS

Native SwiftUI companion in the Cut Coach product family. It targets iOS 26 and uses system navigation, tabs, sheets, forms, controls, SF Symbols, Dynamic Type and Swift Charts.

## Run

Open `WeightJourney.xcodeproj`, connect `iPhoneXvirus`, select it as the run destination and run `WeightJourney`. This project intentionally targets physical iPhone hardware only.

No third-party dependencies are required. Profile and daily entries currently persist locally through `JourneyStore`; this boundary is intentionally replaceable with Supabase sync later.

## Product structure

- Home: current weight, 100 → 85 journey, energy reservoir.
- Add Today: native partial-entry sheet.
- Progress: daily values and seven-day trend.
- Review: calm weekly recommendation.
- Profile: goals, optional calorie guidance, reminders and appearance.
- How it works: formulas, technology and decision rules.
