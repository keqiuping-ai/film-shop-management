import Foundation

actor PersistentQueues {
    private struct ActiveRecording: Codable {
        let id: UUID
        let planId: String
        let relativePath: String
        let createdAt: Date
    }

    static let shared = PersistentQueues()
    private let manager = FileManager.default

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

    func recordings() -> [RecordingSegment] { read([RecordingSegment].self, from: recordingManifest) ?? [] }
    func locations() -> [QueuedLocation] { read([QueuedLocation].self, from: locationManifest) ?? [] }

    func appendRecording(_ segment: RecordingSegment) throws {
        var items = recordings()
        guard !items.contains(where: { $0.id == segment.id }) else { return }
        items.append(segment)
        try write(items, to: recordingManifest)
    }

    func registerActiveRecording(id: UUID, planId: String, relativePath: String, createdAt: Date) throws {
        var items = read([ActiveRecording].self, from: activeRecordingManifest) ?? []
        guard !items.contains(where: { $0.id == id }) else { return }
        items.append(ActiveRecording(id: id, planId: planId, relativePath: relativePath, createdAt: createdAt))
        try write(items, to: activeRecordingManifest)
    }

    func finalizeActiveRecording(id: UUID, byteCount: Int) throws {
        var activeItems = read([ActiveRecording].self, from: activeRecordingManifest) ?? []
        guard let active = activeItems.first(where: { $0.id == id }) else { return }
        if byteCount > 0 {
            try appendRecording(RecordingSegment(
                id: active.id,
                planId: active.planId,
                relativePath: active.relativePath,
                createdAt: active.createdAt,
                byteCount: byteCount,
                attempts: 0
            ))
        } else {
            try? manager.removeItem(at: recordingURL(name: active.relativePath))
        }
        activeItems.removeAll { $0.id == id }
        try write(activeItems, to: activeRecordingManifest)
    }

    func abandonActiveRecording(id: UUID) throws {
        var activeItems = read([ActiveRecording].self, from: activeRecordingManifest) ?? []
        guard let active = activeItems.first(where: { $0.id == id }) else { return }
        activeItems.removeAll { $0.id == id }
        try write(activeItems, to: activeRecordingManifest)
        try? manager.removeItem(at: recordingURL(name: active.relativePath))
    }

    @discardableResult
    func recoverInterruptedRecordings() throws -> Int {
        let activeItems = read([ActiveRecording].self, from: activeRecordingManifest) ?? []
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
                    attempts: 0
                ))
                recovered += 1
            } else {
                try? manager.removeItem(at: url)
            }
        }
        try write([ActiveRecording](), to: activeRecordingManifest)
        return recovered
    }

    func removeRecording(_ id: UUID) throws {
        var items = recordings()
        guard let segment = items.first(where: { $0.id == id }) else { return }
        items.removeAll { $0.id == id }
        try write(items, to: recordingManifest)
        try? manager.removeItem(at: recordingURL(name: segment.relativePath))
    }

    func reconcileRecordingSize(_ id: UUID, byteCount: Int) throws {
        var items = recordings()
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].byteCount = byteCount
        items[index].lastError = nil
        try write(items, to: recordingManifest)
    }

    func markRecordingFailed(_ id: UUID, reason: String) throws {
        var items = recordings()
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].attempts += 1
        items[index].lastError = reason
        try write(items, to: recordingManifest)
    }

    func appendLocation(_ point: QueuedLocation) throws {
        var items = locations()
        guard !items.contains(where: { $0.id == point.id }) else { return }
        items.append(point)
        try write(items, to: locationManifest)
    }

    func removeLocation(_ id: UUID) throws {
        var items = locations()
        items.removeAll { $0.id == id }
        try write(items, to: locationManifest)
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
