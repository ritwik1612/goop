import Foundation

enum NativeGoogleHealth {
    // Tokens remain in the native Google SDK and are never passed into JavaScript or widgets.
    static func read(token: String) async throws -> [[String: Any]] {
        guard let identity = URL(string: "https://health.googleapis.com/v4/users/me/identity") else { throw URLError(.badURL) }
        var identityRequest = URLRequest(url: identity); identityRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (_, identityResponse) = try await URLSession.shared.data(for: identityRequest)
        guard (identityResponse as? HTTPURLResponse)?.statusCode == 200 else { throw NSError(domain: "GOOP", code: 2, userInfo: [NSLocalizedDescriptionKey: "Link your account in the Google Health app before connecting GOOP."]) }
        let date = ISO8601DateFormatter().string(from: .now.addingTimeInterval(-35 * 86400)).prefix(10)
        let types = ["daily-heart-rate-variability","daily-resting-heart-rate","daily-respiratory-rate","daily-oxygen-saturation","daily-sleep-temperature-derivations","daily-vo2-max","sleep","exercise","weight"]
        var records: [[String: Any]] = []
        var failures = 0
        for type in types {
            let field = type.replacingOccurrences(of: "-", with: "_")
            let filter = type.hasPrefix("daily-") ? "\(field).date >= \"\(date)\"" : type == "sleep" ? "sleep.interval.civil_end_time >= \"\(date)\"" : type == "weight" ? "weight.sample_time.civil_time >= \"\(date)\"" : "exercise.interval.civil_start_time >= \"\(date)\""
            var pageToken: String? = nil
            for _ in 0..<10 {
                let method = type == "exercise" ? "" : ":reconcile"
                var parts = URLComponents(string: "https://health.googleapis.com/v4/users/me/dataTypes/\(type)/dataPoints\(method)")!
                parts.queryItems = [URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "pageSize", value: ["sleep","exercise"].contains(type) ? "25" : "10000")]
                if let pageToken { parts.queryItems?.append(URLQueryItem(name: "pageToken", value: pageToken)) }
                guard let url = parts.url else { continue }
                var request = URLRequest(url: url); request.timeoutInterval = 20
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                let (data, response) = try await URLSession.shared.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { failures += 1; break }
                guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { break }
                records += object["reconciledDataPoints"] as? [[String: Any]] ?? object["dataPoints"] as? [[String: Any]] ?? []
                pageToken = object["nextPageToken"] as? String
                if pageToken == nil { break }
            }
        }
        if records.isEmpty && failures > 0 { throw NSError(domain: "GOOP", code: 3, userInfo: [NSLocalizedDescriptionKey: "No Google Health collections were available. Check permissions and your API project."]) }
        return records
    }
}
