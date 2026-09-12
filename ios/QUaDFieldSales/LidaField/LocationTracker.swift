import CoreLocation
import Foundation

@MainActor
final class LocationTracker: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var isTracking = false
    @Published private(set) var lastLocation: CLLocation?
    @Published var status = "定位未开始"

    private let manager = CLLocationManager()
    private var shiftId: String?
    private var lastQueuedAt = Date.distantPast
    private var oneShotContinuation: CheckedContinuation<CLLocation, Error>?
    private var oneShotTimeoutTask: Task<Void, Never>?
    private let maximumUsableAccuracyM: CLLocationAccuracy = 1_000
    var onPoint: ((QueuedLocation) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 20
        // Core Location selects the best position available from satellites,
        // Wi-Fi, cellular networks and cached system locations. Field work can
        // happen indoors or on foot, so do not model every request as driving.
        manager.activityType = .other
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
    }

    func requestAuthorization() { manager.requestAlwaysAuthorization() }

    func currentSystemLocation(for purpose: SystemLocationPurpose) async throws -> CLLocation {
        do {
            let location = try await liveSystemLocation(timeoutSeconds: purpose.timeoutSeconds)
            status = "\(purpose.displayName)已取得手机综合定位 · 精度约 ±\(Int(location.horizontalAccuracy)) 米"
            return location
        } catch {
            let candidates = [lastLocation, manager.location]
                .compactMap { $0 }
                .filter { isUsable($0, maximumAge: purpose.maximumCachedAgeSeconds) }
            if let available = candidates.max(by: { $0.timestamp < $1.timestamp }) {
                status = "\(purpose.displayName)已使用手机近期有效位置 · 精度约 ±\(Int(available.horizontalAccuracy)) 米"
                return available
            }
            throw error
        }
    }

    /// Converts the fused Core Location fix into a street-level label when
    /// Apple's geocoder has enough map data. A geocoding failure never makes
    /// the underlying location invalid; coordinates, time and accuracy remain
    /// the authoritative evidence.
    func humanReadableAddress(for location: CLLocation) async -> String? {
        do {
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(
                location,
                preferredLocale: Locale(identifier: "zh-Hans")
            )
            guard let mark = placemarks.first else { return nil }
            let street = [mark.subThoroughfare, mark.thoroughfare]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            let parts = [street, mark.subLocality, mark.locality, mark.administrativeArea, mark.postalCode, mark.country]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            let unique = parts.reduce(into: [String]()) { result, item in
                if !result.contains(item) { result.append(item) }
            }
            return unique.isEmpty ? nil : unique.joined(separator: " · ")
        } catch {
            return nil
        }
    }

    private func liveSystemLocation(timeoutSeconds: Double) async throws -> CLLocation {
        if let lastLocation, isUsable(lastLocation, maximumAge: 60) { return lastLocation }
        if let systemLocation = manager.location, isUsable(systemLocation, maximumAge: 60) {
            lastLocation = systemLocation
            status = "已取得手机当前综合定位"
            return systemLocation
        }
        guard CLLocationManager.locationServicesEnabled() else {
            status = "系统定位服务未开启"
            throw LocationTrackerError.servicesDisabled
        }
        switch manager.authorizationStatus {
        case .denied, .restricted:
            status = "定位权限未开启"
            throw LocationTrackerError.permissionDenied
        default:
            break
        }
        guard oneShotContinuation == nil else {
            throw LocationTrackerError.requestInProgress
        }
        status = "正在获取手机综合定位（卫星、Wi-Fi、蜂窝网络）"
        manager.requestWhenInUseAuthorization()
        return try await withCheckedThrowingContinuation { continuation in
            oneShotContinuation = continuation
            // Continuous updates allow an indoor Wi-Fi/cellular fix to replace
            // an old or overly coarse first result before the explicit timeout.
            manager.startUpdatingLocation()
            oneShotTimeoutTask?.cancel()
            oneShotTimeoutTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(timeoutSeconds))
                guard !Task.isCancelled else { return }
                self?.status = "定位获取超时，请重试"
                self?.finishOneShot(.failure(LocationTrackerError.timedOut))
            }
        }
    }

    func start(shiftId: String) {
        self.shiftId = shiftId
        requestAuthorization()
        manager.startUpdatingLocation()
        isTracking = true
        status = "上班中 · 手机综合定位持续记录"
    }

    func stop() {
        manager.stopUpdatingLocation()
        shiftId = nil
        isTracking = false
        status = "已下班"
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        lastLocation = location
        if let continuation = oneShotContinuation {
            if isUsable(location, maximumAge: 60) {
                oneShotContinuation = nil
                oneShotTimeoutTask?.cancel()
                oneShotTimeoutTask = nil
                if shiftId == nil { manager.stopUpdatingLocation() }
                status = "手机综合定位可用 · 精度约 ±\(Int(location.horizontalAccuracy)) 米"
                continuation.resume(returning: location)
            } else {
                status = "已收到手机位置，正在等待系统改善定位精度"
            }
        }
        guard let shiftId, Date().timeIntervalSince(lastQueuedAt) >= 300 else { return }
        lastQueuedAt = Date()
        Task { [weak self] in
            guard let self else { return }
            let address = await humanReadableAddress(for: location)
            let point = QueuedLocation(
                id: UUID(), shiftId: shiftId,
                collectedAt: ISO8601DateFormatter().string(from: location.timestamp),
                latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                accuracyM: location.horizontalAccuracy,
                address: address
            )
            try? await PersistentQueues.shared.appendLocation(point)
            onPoint?(point)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let locationError = error as? CLError, locationError.code == .locationUnknown {
            // This is a transient system-positioning condition. Keep waiting so
            // Wi-Fi or cellular positioning can still succeed indoors.
            status = "定位信号暂不稳定，正在继续获取手机综合位置"
            return
        }
        let reportedError: Error
        if let locationError = error as? CLError, locationError.code == .denied {
            reportedError = LocationTrackerError.permissionDenied
        } else {
            reportedError = error
        }
        finishOneShot(.failure(reportedError))
        status = "定位待恢复：\(reportedError.localizedDescription)"
    }

    private func finishOneShot(_ result: Result<CLLocation, Error>) {
        guard let continuation = oneShotContinuation else { return }
        oneShotContinuation = nil
        oneShotTimeoutTask?.cancel()
        oneShotTimeoutTask = nil
        if shiftId == nil { manager.stopUpdatingLocation() }
        continuation.resume(with: result)
    }

    private func isUsable(_ location: CLLocation, maximumAge: TimeInterval) -> Bool {
        let age = abs(Date().timeIntervalSince(location.timestamp))
        return location.horizontalAccuracy >= 0
            && location.horizontalAccuracy <= maximumUsableAccuracyM
            && age <= maximumAge
    }
}

enum SystemLocationPurpose: Sendable {
    case attendance
    case visitArrival
    case fieldEvidence
    case nearbyCustomers
    case customerRecognition

    var timeoutSeconds: Double {
        switch self {
        case .customerRecognition: 12
        case .nearbyCustomers: 15
        case .attendance, .visitArrival, .fieldEvidence: 25
        }
    }

    var maximumCachedAgeSeconds: TimeInterval { 180 }

    var displayName: String {
        switch self {
        case .attendance: "上下班打卡"
        case .visitArrival: "拜访到店"
        case .fieldEvidence: "现场凭证"
        case .nearbyCustomers: "附近客户"
        case .customerRecognition: "客户资料识别"
        }
    }
}

enum LocationTrackerError: LocalizedError {
    case servicesDisabled
    case permissionDenied
    case requestInProgress
    case timedOut

    var errorDescription: String? {
        switch self {
        case .servicesDisabled:
            "系统定位服务未开启，请先在 iPhone 设置中开启定位服务"
        case .permissionDenied:
            "QUaD Field Sales 没有定位权限，请在设置中允许使用定位"
        case .requestInProgress:
            "正在获取当前位置，请稍候"
        case .timedOut:
            "25 秒内没有取得可用手机定位，请确认已开启定位、Wi-Fi 或蜂窝网络后重试"
        }
    }
}
