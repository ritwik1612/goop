import WidgetKit
import SwiftUI
import ActivityKit
import CoreText

struct SnapshotEntry: TimelineEntry { let date: Date; let snapshot: DashboardSnapshot }
struct GOOPProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: .now, snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) { completion(SnapshotEntry(date: .now, snapshot: SnapshotStore.load())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        completion(Timeline(entries: [SnapshotEntry(date: .now, snapshot: SnapshotStore.load())], policy: .after(.now.addingTimeInterval(900))))
    }
}

struct SmallRing: View {
    let title: String; let value: Double?; let maximum: Double; let tint: Color
    var compact = false
    var body: some View {
        VStack(spacing: compact ? 3 : 7) {
            ZStack {
                Circle().stroke(tint.opacity(0.18), lineWidth: compact ? 3 : 4)
                Circle().trim(from: 0, to: CGFloat(min(max((value ?? 0) / maximum, 0), 1)))
                    .stroke(tint, style: StrokeStyle(lineWidth: compact ? 3 : 4, lineCap: .butt)).rotationEffect(.degrees(-90))
                Text(value.map { maximum == 21 ? String(format: "%.1f", $0) : String(format: "%.0f", $0) } ?? "—")
                    .font(.system(size: compact ? 12 : 20, weight: .bold, design: .rounded)).minimumScaleFactor(0.6)
            }.aspectRatio(1, contentMode: .fit)
            Text(title).font(.system(size: compact ? 5 : 7, weight: .bold)).tracking(0.7).foregroundStyle(.secondary)
        }.accessibilityElement(children: .combine)
    }
}

struct DailyRingsView: View {
    @Environment(\.widgetFamily) var family
    let entry: SnapshotEntry
    var accessory: Bool { family == .accessoryRectangular || family == .accessoryCircular }
    var body: some View {
        let s = entry.snapshot
        VStack(alignment: .leading, spacing: 10) {
            if !accessory { HStack { Text("GOOP").font(.system(size: 9, weight: .bold)).tracking(1.1); Spacer(); Text(s.sample ? "DEMO" : "LAST SYNC").font(.system(size: 6, weight: .semibold)).foregroundStyle(.secondary) } }
            if family == .accessoryCircular {
                SmallRing(title: "RECOVERY", value: s.recovery, maximum: 100, tint: .primary, compact: true)
            } else {
                HStack(spacing: accessory ? 9 : 12) {
                    SmallRing(title: "SLEEP", value: s.sleep, maximum: 100, tint: accessory ? .primary : Color(red: 0.55, green: 0.67, blue: 0.74), compact: accessory)
                    SmallRing(title: "RECOVERY", value: s.recovery, maximum: 100, tint: accessory ? .primary : Color(red: 0.5, green: 0.88, blue: 0.25), compact: accessory)
                    SmallRing(title: "STRAIN", value: s.strain, maximum: 21, tint: accessory ? .primary : Color(red: 0.37, green: 0.61, blue: 0.88), compact: accessory)
                }
            }
        }
        .containerBackground(for: .widget) { accessory ? Color.clear : Color(red: 0.12, green: 0.16, blue: 0.19) }
        .widgetURL(URL(string: "goop://home"))
    }
}

struct DailyRingsWidget: Widget {
    let kind = "GOOPDailyRings"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GOOPProvider()) { DailyRingsView(entry: $0) }
            .configurationDisplayName("GOOP Rings")
            .description("Sleep, recovery and strain. Transparent-style, system-tinted rings on the Lock Screen.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

struct RecoveryWidget: Widget {
    let kind = "GOOPSleepRecovery"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GOOPProvider()) { entry in
            let s = entry.snapshot
            VStack(alignment: .leading, spacing: 6) {
                Text(s.sample ? "GOOP · DEMO" : "GOOP · LAST SYNC").font(.system(size: 7, weight: .bold)).tracking(1)
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.sleepMinutes.map { String(format: "%d:%02d", Int($0) / 60, Int($0) % 60) } ?? "—").font(.system(size: 22, weight: .bold, design: .rounded))
                        Text("SLEEP").font(.system(size: 6, weight: .bold))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(s.recovery.map { String(format: "%.0f%%", $0) } ?? "—").font(.system(size: 22, weight: .bold, design: .rounded))
                        Text("RECOVERY").font(.system(size: 6, weight: .bold))
                    }
                }
            }.containerBackground(for: .widget) { Color.clear }.widgetURL(URL(string: "goop://health"))
        }.configurationDisplayName("Sleep & Recovery").description("A minimal, separate sleep and recovery snapshot.").supportedFamilies([.accessoryRectangular, .systemSmall])
    }
}

struct WorkoutReadout: View {
    let workout: WorkoutSnapshot?
    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack { Label(workout?.type.uppercased() ?? "NO ACTIVE WORKOUT", systemImage: "figure.run").font(.system(size: 10, weight: .bold)); Spacer(); if workout?.simulated == true { Text("SIMULATED").font(.system(size: 6, weight: .bold)).foregroundStyle(.secondary) } }
            HStack(alignment: .firstTextBaseline) {
                if let w = workout {
                    if w.paused { Text(Duration.seconds(w.elapsed).formatted(.time(pattern: .minuteSecond))).font(.system(size: 33, weight: .bold, design: .rounded)) }
                    else { Text(w.timerStart, style: .timer).monospacedDigit().font(.system(size: 33, weight: .bold, design: .rounded)) }
                } else { Text("—").font(.system(size: 33, weight: .bold)) }
                Spacer()
                Text(workout?.heartRate.map { String(format: "♥ %.0f", $0) } ?? "♥ —").font(.system(size: 29, weight: .bold, design: .rounded))
                Text("bpm").font(.system(size: 9)).foregroundStyle(.secondary)
            }
            HStack(spacing: 3) { ForEach([Color.gray, .blue, .mint, .yellow, .orange], id: \.self) { $0.opacity(0.7).frame(height: 4) } }
            Text(workout?.paused == true ? "PAUSED" : "Elapsed timer · Heart rate is the last received reading").font(.system(size: 7)).foregroundStyle(.secondary)
        }.padding(15)
    }
}

struct WorkoutWidget: Widget {
    let kind = "GOOPWorkout"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GOOPProvider()) { entry in
            WorkoutReadout(workout: entry.snapshot.workout)
                .containerBackground(for: .widget) { Color(red: 0.12, green: 0.16, blue: 0.19) }
                .widgetURL(URL(string: "goop://live"))
        }.configurationDisplayName("GOOP Workout").description("Elapsed time and the last available workout heart rate.").supportedFamilies([.systemMedium])
    }
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GOOPWorkoutAttributes.self) { context in
            WorkoutReadout(workout: context.state.workout).activityBackgroundTint(Color(red: 0.12, green: 0.16, blue: 0.19)).activitySystemActionForegroundColor(.white).widgetURL(URL(string: "goop://live"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label(context.attributes.activityName, systemImage: "figure.run").font(.caption) }
                DynamicIslandExpandedRegion(.trailing) { Text(context.state.workout.heartRate.map { String(format: "♥ %.0f", $0) } ?? "♥ —").font(.headline) }
                DynamicIslandExpandedRegion(.bottom) { if context.state.workout.paused { Text("Paused") } else { Text(context.state.workout.timerStart, style: .timer).monospacedDigit() } }
            } compactLeading: { Image(systemName: "figure.run") }
            compactTrailing: { Text(context.state.workout.paused ? "Ⅱ" : "GOOP").font(.system(size: 9, weight: .bold)) }
            minimal: { Image(systemName: "figure.run") }
            .widgetURL(URL(string: "goop://live"))
        }
    }
}

@main struct GOOPWidgetBundle: WidgetBundle {
    init() {
        if let fontURL = Bundle.main.url(forResource: "D-DIN-Bold", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, nil)
        }
    }
    var body: some Widget { DailyRingsWidget(); RecoveryWidget(); WorkoutWidget(); WorkoutLiveActivity() }
}
