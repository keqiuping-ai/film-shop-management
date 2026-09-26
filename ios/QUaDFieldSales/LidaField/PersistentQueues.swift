import Foundation

actor PersistentQueues {
    private struct ActiveRecording: Codable {
        let id: UUID
        let planId: String
        let relativePath: String
        let createdAt: Date
        var ownerIdentifier: String? = nil
    }

    static let shared = PersistentQueues()
    private let manager = FileManager.default
    private var activeOwnerIdentifier: String?

    private var baseDirectory: URL {
        let root = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LidaField", isDirectory: true)
        try? manager.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private var recordingManifest: URL { baseDirectory.appendingPathComponent("recording-queue.json") }
    private var activeRecordingManifest: URL { baseDirectory.appendingPathComponent("active-recordings.json") }
    private var locationManifest: URL { baseDirectory.appendingPathComponent("location-queue.json") }
    var recordingDirectory: URL {
        let value = baseDirectory.appendingPathComponent("recordings", isDirectory: true)
        try? manager.createDirectory(at: value, withIntermediateDirectories: true)
        return value
    }

    func recordingURL(name: String) -> URL { recordingDirectory.appendingPathComponent(name) }

    func makeRecordingURL() throws -> URL {
        let root = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LidaField", isDirectory: true)
        let directory = root.appendingPathComponent("recordings", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)

        var isDirectory: ObjCBool = false
        guard manager.fileExists(atPath: directory.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw RecordingStorageError.directoryUnavailable
        }
        return directory.appendingPathComponent("meeting-\(UUID().uuidString).m4a")
    }

    func activate(ownerIdentifier: String?, claimUnowned: Bool = false) throws {
        activeOwnerIdentifier = ownerIdentifier
        guard let ownerIdentifier, claimUnowned else { return }

        var recordingItems = allRecordings()
        var recordingChanged = false
        for index in recordingItems.indices where recordingItems[index].ownerIdentifier == nil {
            recordingItems[index].ownerIdentifier = ownerIdentifier
            recordingChanged = true
        }
        if recordingChanged { try write(recordingItems, to: recordingManifest) }

        var locationItems = allLocations()
        var locationChanged = false
        for index in locationItems.indices where locationItems[index].ownerIdentifier == nil {
            locationItems[index].ownerIdentifier = ownerIdentifier
            locationChanged = true
        }
        if locationChanged { try write(locationItems, to: locationManifest) }

        var activeItems = allActiveRecordings()
        var activeChanged = false
        for index in activeItems.indices where activeItems[index].ownerIdentifier == nil {
            activeItems[index].ownerIdentifier = ownerIdentifier
            activeChanged = true
        }
        if activeChanged { try write(activeItems, to: activeRecordingManifest) }
    }

    func recordings() -> [RecordingSegment] {
        guard let activeOwnerIdentifier else { return [] }
        return allRecordings().filter { $0.ownerIdentifier == activeOwnerIdentifier }
    }

    func locations() -> [QueuedLocation] {
        guard let activeOwnerIdentifier else { return [] }
        return allLocations().filter { $0.ownerIdentifier == activeOwnerIdentifier }
    }

    func appendRecording(_ segment: RecordingSegment) throws {
        var items = allRecordings()
        guard !items.contains(where: { $0.id == segment.id }) else { return }
        var ownedSegment = segment
        if ownedSegment.ownerIdentifier == nil {
            ownedSegment.ownerIdentifier = activeOwnerIdentifier
        }
        items.append(ownedSegment)
        try write(items, to: recordingManifest)
    }

    func registerActiveRecording(id: UUID, planId: String, relativePath: String, createdAt: Date) throws {
        var items = allActiveRecordings()
        guard !items.contains(where: { $0.id == id }) else { return }
        items.append(ActiveRecording(
            id: id,
            planId: planId,
            relativePath: relativePath,
            createdAt: createdAt,
            ownerIdentifier: activeOwnerIdentifier
        ))
        try write(items, to: activeRecordingManifest)
    }

    func finalizeActiveRecording(id: UUID, byteCount: Int) throws {
        var activeItems = allActiveRecordings()
        guard let active = activeItems.first(where: { $0.id == id }) else { return }
        if byteCount > 0 {
            try appendRecording(RecordingSegment(
                id: active.id,
                planId: active.planId,
                relativePath: active.relativePath,
                createdAt: active.createdAt,
                byteCount: byteCount,
                attempts: 0,
                ownerIdentifier: active.ownerIdentifier
            ))
        } else {
            try? manager.removeItem(at: recordingURL(name: active.relativePath))
        }
        activeItems.removeAll { $0.id == id }
        try write(activeItems, to: activeRecordingManifest)
    }

    func abandonActiveRecording(id: UUID) throws {
        var activeItems = allActiveRecordings()
        guard let active = activeItems.first(where: { $0.id == id }) else { return }
        activeItems.removeAll { $0.id == id }
        try write(activeItems, to: activeRecordingManifest)
        try? manager.removeItem(at: recordingURL(name: active.relativePath))
    }

    @discardableResult
    func recoverInterruptedRecordings() throws -> Int {
        let activeItems = allActiveRecordings().filter { $0.ownerIdentifier == activeOwnerIdentifier }
        var recovered = 0
        for active in activeItems {
            let url = recordingURL(name: active.relativePath)
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > 0 {
                try appendRecording(RecordingSegment(
                    id: active.id,
                    planId: active.planId,
                    relativePath: active.relativePath,
                    createdAt: active.createdAt,
                    byteCount: size,
                    attempts: 0,
                    ownerIdentifier: active.ownerIdentifier
                ))
                recovered += 1
            } else {
                try? manager.removeItem(at: url)
            }
        }
        let recoveredIDs = Set(activeItems.map(\.id))
        let remaining = allActiveRecordings().filter { !recoveredIDs.contains($0.id) }
        try write(remaining, to: activeRecordingManifest)
        return recovered
    }

    func removeRecording(_ id: UUID) throws {
        var items = allRecordings()
        guard let segment = items.first(where: { $0.id == id }) else { return }
        items.removeAll { $0.id == id }
        try write(items, to: recordingManifest)
        try? manager.removeItem(at: recordingURL(name: segment.relativePath))
    }

    func reconcileRecordingSize(_ id: UUID, byteCount: Int) throws {
        var items = allRecordings()
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].byteCount = byteCount
        items[index].lastError = nil
        try write(items, to: recordingManifest)
    }

    func markRecordingFailed(_ id: UUID, reason: String) throws {
        var items = allRecordings()
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].attempts += 1
        items[index].lastError = reason
        try write(items, to: recordingManifest)
    }

    func appendLocation(_ point: QueuedLocation) throws {
        var items = allLocations()
        guard !items.contains(where: { $0.id == point.id }) else { return }
        var ownedPoint = point
        if ownedPoint.ownerIdentifier == nil {
            ownedPoint.ownerIdentifier = activeOwnerIdentifier
        }
        items.append(ownedPoint)
        try write(items, to: locationManifest)
    }

    func removeLocation(_ id: UUID) throws {
        var items = allLocations()
        items.removeAll { $0.id == id }
        try write(items, to: locationManifest)
    }

    private func allRecordings() -> [RecordingSegment] {
        read([RecordingSegment].self, from: recordingManifest) ?? []
    }

    private func allLocations() -> [QueuedLocation] {
        read([QueuedLocation].self, from: locationManifest) ?? []
    }

    private func allActiveRecordings() -> [ActiveRecording] {
        read([ActiveRecording].self, from: activeRecordingManifest) ?? []
    }

    private func read<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func write<T: Encodable>(_ value: T, to url: URL) throws {
        let data = try JSONEncoder().encode(value)
        try data.write(to: url, options: .atomic)
    }
}

enum RecordingStorageError: LocalizedError {
    case directoryUnavailable

    var errorDescription: String? {
        "无法创建本机语音保存目录，请重新打开 App 后再试"
    }
}
