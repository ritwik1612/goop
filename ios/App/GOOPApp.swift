import SwiftUI
import WebKit
import WidgetKit
import ActivityKit
import GoogleSignIn

@main struct GOOPApp: App {
    @AppStorage("goop.host") private var host = ""
    @State private var draft = ""
    var body: some Scene {
        WindowGroup {
            Group {
                if let url = URL(string: host), url.scheme == "https", url.host != nil {
                    GOOPWebView(baseURL: url).ignoresSafeArea(.container, edges: .bottom)
                } else {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("GOOP").font(.largeTitle.bold())
                        Text("Connect to your own GOOP installation.").foregroundStyle(.secondary)
                        TextField("https://your-own-host", text: $draft).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).textFieldStyle(.roundedBorder)
                        Button("Open GOOP") { if let url = URL(string: draft), url.scheme == "https", url.host != nil { host = draft } }.buttonStyle(.borderedProminent)
                        Text("Widgets display your last synced data. Workout heart rate is only available when a real source supplies it; demo readings are labelled.").font(.footnote).foregroundStyle(.secondary)
                    }.padding(28)
                }
            }.preferredColorScheme(.dark)
                .onOpenURL { url in
                    if !GIDSignIn.sharedInstance.handle(url), url.scheme == "goop" {
                        NotificationCenter.default.post(name: .goopDeepLink, object: url.host ?? "home")
                    }
                }
        }
    }
}
extension Notification.Name { static let goopDeepLink = Notification.Name("GOOPDeepLink") }

struct GOOPWebView: UIViewRepresentable {
    let baseURL: URL
    func makeCoordinator() -> Coordinator { Coordinator(baseURL: baseURL) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "goop")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false; web.backgroundColor = .black
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        web.load(URLRequest(url: baseURL))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) { web.configuration.userContentController.removeScriptMessageHandler(forName: "goop") }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let baseURL: URL
        weak var web: WKWebView?
        private var lastReload = Date.distantPast
        private var observer: NSObjectProtocol?
        init(baseURL: URL) {
            self.baseURL = baseURL
            super.init()
            observer = NotificationCenter.default.addObserver(forName: .goopDeepLink, object: nil, queue: .main) { [weak self] event in
                guard let self, let path = event.object as? String, ["home","health","live","widgets","journal"].contains(path) else { return }
                var components = URLComponents(url: self.baseURL, resolvingAgainstBaseURL: false)
                components?.fragment = path
                if let url = components?.url { self.web?.load(URLRequest(url: url)) }
            }
        }
        deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == baseURL.scheme && url.host == baseURL.host && url.port == baseURL.port { decisionHandler(.allow) }
            else { if navigationAction.navigationType == .linkActivated { UIApplication.shared.open(url) }; decisionHandler(.cancel) }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if GIDSignIn.sharedInstance.currentUser != nil { Task { await syncGoogle(interactive: false) } }
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == baseURL.scheme,
                  message.frameInfo.securityOrigin.host == baseURL.host,
                  let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            if type == "connectGoogle" { Task { await syncGoogle(interactive: true) }; return }
            if type == "syncGoogle" { Task { await syncGoogle(interactive: false) }; return }
            guard type == "snapshot", let object = body["snapshot"],
                  let data = try? JSONSerialization.data(withJSONObject: object), data.count < 4096,
                  let snapshot = try? JSONDecoder().decode(DashboardSnapshot.self, from: data) else { return }
            let previous = SnapshotStore.load()
            do { try SnapshotStore.save(snapshot) } catch { return }
            if snapshot.sleep != previous.sleep || snapshot.recovery != previous.recovery || snapshot.strain != previous.strain || snapshot.workout?.startedAt != previous.workout?.startedAt || Date().timeIntervalSince(lastReload) > 60 {
                WidgetCenter.shared.reloadAllTimelines(); lastReload = .now
            }
            Task { await updateActivity(snapshot.workout) }
        }
        @MainActor private func updateActivity(_ workout: WorkoutSnapshot?) async {
            let running = Activity<GOOPWorkoutAttributes>.activities
            guard let workout else { for activity in running { await activity.end(nil, dismissalPolicy: .immediate) }; return }
            let content = ActivityContent(state: GOOPWorkoutAttributes.ContentState(workout: workout, updatedAt: .now), staleDate: .now.addingTimeInterval(60))
            if let activity = running.first { await activity.update(content) }
            else if ActivityAuthorizationInfo().areActivitiesEnabled {
                _ = try? Activity.request(attributes: GOOPWorkoutAttributes(activityName: workout.type), content: content, pushType: nil)
            }
        }
        @MainActor private func syncGoogle(interactive: Bool) async {
            do {
                guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String, !clientID.isEmpty, !clientID.contains("YOUR_") else { throw NSError(domain: "GOOP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Set your own iOS Google OAuth client ID in Config.xcconfig first."]) }
                GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
                var user = GIDSignIn.sharedInstance.currentUser
                if interactive || user == nil {
                    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                          let presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
                    let scopes = ["activity_and_fitness","sleep","health_metrics_and_measurements"].map { "https://www.googleapis.com/auth/googlehealth.\($0).readonly" }
                    let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter, hint: nil, additionalScopes: scopes)
                    user = result.user
                }
                guard let user else { return }
                let refreshed = try await user.refreshTokensIfNeeded()
                let records = try await NativeGoogleHealth.read(token: refreshed.accessToken.tokenString)
                guard let web else { return }
                _ = try await web.callAsyncJavaScript("await window.GOOPNative.receive(records)", arguments: ["records": records], in: nil, contentWorld: .page)
            } catch {
                let alert = UIAlertController(title: "Google Health", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene { scene.windows.first(where: \.isKeyWindow)?.rootViewController?.present(alert, animated: true) }
            }
        }
    }
}
