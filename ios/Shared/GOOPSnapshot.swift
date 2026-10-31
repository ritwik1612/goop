import Foundation
import ActivityKit

struct WorkoutSnapshot: Codable, Hashable {
    var type: String
    var startedAt: Double
    var activeSince: Double
    var elapsed: Double
    var paused: Bool
    var heartRate: Double?
    var simulated: Bool
    func duration(at date: Date = .now) -> TimeInterval {
        max(0, elapsed + (paused ? 0 : date.timeIntervalSince1970 - activeSince))
    }
    var timerStart: Date { Date().addingTimeInterval(-duration()) }
}

struct DashboardSnapshot: Codable, Hashable {
    var updatedAt: Double
    var date: String
    var sample: Bool
    var sleep: Double?
    var recovery: Double?
    var strain: Double?
    var sleepMinutes: Double?
    var workout: WorkoutSnapshot?
    static let empty = DashboardSnapshot(updatedAt: 0, date: "", sample: false)
}

enum SnapshotStore {
    static var group: String { Bundle.main.object(forInfoDictionaryKey: "GOOPAppGroup") as? String ?? "group.com.example.goop" }
    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }
    static func load() -> DashboardSnapshot {
        guard let data = defaults?.data(forKey: "goop.snapshot"),
              let snapshot = try? JSONDecoder().decode(DashboardSnapshot.self, from: data) else { return .empty }
        return snapshot
    }
    static func save(_ snapshot: DashboardSnapshot) throws {
        guard let defaults else { throw CocoaError(.fileWriteNoPermission) }
        defaults.set(try JSONEncoder().encode(snapshot), forKey: "goop.snapshot")
    }
}

struct GOOPWorkoutAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var workout: WorkoutSnapshot
        var updatedAt: Date
    }
    var activityName: String
}
