import Combine
import CoreMotion
import SwiftUI

@MainActor
final class MotionLight: ObservableObject {
    @Published private(set) var offset = CGSize.zero
    private let manager = CMMotionManager()

    func start(reduceMotion: Bool) {
        guard !reduceMotion, manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1 / 30
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            let roll = max(-0.45, min(0.45, motion.attitude.roll))
            let pitch = max(-0.45, min(0.45, motion.attitude.pitch))
            self?.offset = CGSize(width: roll * 30, height: pitch * 24)
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        offset = .zero
    }
}
