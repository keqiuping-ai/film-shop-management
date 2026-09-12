@preconcurrency import AVFoundation
import Foundation
import OSLog
import Speech

/// A small privacy-safe device log for diagnosing hardware-only speech failures.
/// It records engine state and error codes, never microphone audio or transcript text.
private actor MeetingSpeechDiagnosticLog {
    static let shared = MeetingSpeechDiagnosticLog()

    private let formatter = ISO8601DateFormatter()
    private let maximumBytes = 256_000

    func append(_ message: String) {
        do {
            let manager = FileManager.default
            let root = try manager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ).appendingPathComponent("LidaField", isDirectory: true)
            try manager.createDirectory(at: root, withIntermediateDirectories: true)
            let url = root.appendingPathComponent("meeting-speech-diagnostics.log")
            if ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) > maximumBytes {
                try? manager.removeItem(at: url)
            }
            let line = "\(formatter.string(from: Date())) \(message)\n"
            let data = Data(line.utf8)
            if !manager.fileExists(atPath: url.path) {
                try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                return
            }
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            // Diagnostics must never interrupt recording or transcription.
        }
    }
}

/// The audio tap runs on AVAudioEngine's realtime thread. This small locked sink lets
/// that one microphone stream feed both the durable m4a file and Speech recognition.
private final class MeetingAudioSink: @unchecked Sendable {
    private final class OwnedAudioBuffer: @unchecked Sendable {
        let value: AVAudioPCMBuffer

        init(_ value: AVAudioPCMBuffer) {
            self.value = value
        }
    }

    private let audioFileLock = NSLock()
    private let writeFailureLock = NSLock()
    private let recognitionLock = NSLock()
    private let recognitionDeliveryQueue = DispatchQueue(
        label: "com.quadfilm.field.meeting-speech-input",
        qos: .userInitiated
    )
    private var audioFile: AVAudioFile?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var modernInputHandler: ((AVAudioPCMBuffer) -> Void)?
    private var inputLevelHandler: ((Float) -> Void)?
    private var writeFailure: Error?
    private var levelSampleCounter = 0

    func consume(_ buffer: AVAudioPCMBuffer) {
        audioFileLock.lock()
        do {
            try audioFile?.write(from: buffer)
        } catch {
            writeFailureLock.lock()
            writeFailure = error
            writeFailureLock.unlock()
        }
        audioFileLock.unlock()

        // AVAudioEngine invokes this method on its realtime render thread. Keep
        // the durable file write there, but never run Speech conversion or
        // request.append(_:) on that thread. SpeechAnalyzer may briefly stall
        // while converting or loading its model; doing that work inline can
        // starve both the live transcript and the next audio-file buffer.
        recognitionLock.lock()
        let needsRecognitionCopy = recognitionRequest != nil || modernInputHandler != nil
        let levelHandler = self.inputLevelHandler
        recognitionLock.unlock()
        if needsRecognitionCopy, let ownedBuffer = Self.copyBuffer(buffer) {
            let owned = OwnedAudioBuffer(ownedBuffer)
            recognitionDeliveryQueue.async { [weak self, owned] in
                self?.deliverToRecognition(owned.value)
            }
        }

        levelSampleCounter += 1
        if levelSampleCounter.isMultiple(of: 12),
           let samples = buffer.floatChannelData?.pointee {
            let frameCount = Int(buffer.frameLength)
            var peak: Float = 0
            if frameCount > 0 {
                for index in stride(from: 0, to: frameCount, by: 8) {
                    peak = max(peak, abs(samples[index]))
                }
            }
            levelHandler?(peak)
        }
    }

    @discardableResult
    func replaceAudioFile(with value: AVAudioFile?) -> AVAudioFile? {
        audioFileLock.lock()
        defer { audioFileLock.unlock() }
        let previous = audioFile
        audioFile = value
        return previous
    }

    func replaceRecognitionRequest(with value: SFSpeechAudioBufferRecognitionRequest?) {
        recognitionLock.lock()
        defer { recognitionLock.unlock() }
        recognitionRequest = value
    }

    func replaceModernInputHandler(with value: ((AVAudioPCMBuffer) -> Void)?) {
        recognitionLock.lock()
        defer { recognitionLock.unlock() }
        modernInputHandler = value
    }

    func replaceInputLevelHandler(with value: ((Float) -> Void)?) {
        recognitionLock.lock()
        defer { recognitionLock.unlock() }
        inputLevelHandler = value
    }

    /// Waits until every speech buffer accepted before this call has been
    /// delivered. The audio tap must be removed (or the recognition handlers
    /// cleared) first so the queue cannot keep growing while a session finishes.
    func drainRecognitionDelivery() async {
        await withCheckedContinuation { continuation in
            recognitionDeliveryQueue.async {
                continuation.resume()
            }
        }
    }

    func takeWriteFailure() -> Error? {
        writeFailureLock.lock()
        defer { writeFailureLock.unlock() }
        let value = writeFailure
        writeFailure = nil
        return value
    }

    private func deliverToRecognition(_ buffer: AVAudioPCMBuffer) {
        recognitionLock.lock()
        let legacyRequest = recognitionRequest
        let modernHandler = modernInputHandler
        recognitionLock.unlock()
        legacyRequest?.append(buffer)
        modernHandler?(buffer)
    }

    private static func copyBuffer(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(
            pcmFormat: source.format,
            frameCapacity: source.frameLength
        ) else { return nil }
        copy.frameLength = source.frameLength

        let sourceBuffers = UnsafeMutableAudioBufferListPointer(source.mutableAudioBufferList)
        let destinationBuffers = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        guard sourceBuffers.count == destinationBuffers.count else { return nil }
        for index in sourceBuffers.indices {
            let sourceBuffer = sourceBuffers[index]
            var destinationBuffer = destinationBuffers[index]
            let byteCount = Int(sourceBuffer.mDataByteSize)
            guard byteCount <= Int(destinationBuffer.mDataByteSize),
                  let sourceData = sourceBuffer.mData,
                  let destinationData = destinationBuffer.mData else { return nil }
            destinationData.copyMemory(from: sourceData, byteCount: byteCount)
            destinationBuffer.mDataByteSize = sourceBuffer.mDataByteSize
            destinationBuffers[index] = destinationBuffer
        }
        return copy
    }
}

private final class OneShotAudioInput: @unchecked Sendable {
    private let buffer: AVAudioPCMBuffer
    private let lock = NSLock()
    private var consumed = false

    init(buffer: AVAudioPCMBuffer) {
        self.buffer = buffer
    }

    func next(status: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
        lock.lock()
        defer { lock.unlock() }
        if consumed {
            status.pointee = .noDataNow
            return nil
        }
        consumed = true
        status.pointee = .haveData
        return buffer
    }
}

@available(iOS 26.0, *)
private final class ModernSpeechPipeline: @unchecked Sendable {
    private let analyzer: SpeechAnalyzer
    private let converter: AVAudioConverter?
    private let analysisFormat: AVAudioFormat
    private let inputBuilder: AsyncStream<AnalyzerInput>.Continuation
    private let resultTask: Task<Void, Never>
    private let onError: @Sendable (Error) -> Void
    let selectedLocaleIdentifier: String

    private init(
        analyzer: SpeechAnalyzer,
        converter: AVAudioConverter?,
        analysisFormat: AVAudioFormat,
        inputBuilder: AsyncStream<AnalyzerInput>.Continuation,
        resultTask: Task<Void, Never>,
        onError: @escaping @Sendable (Error) -> Void,
        selectedLocaleIdentifier: String
    ) {
        self.analyzer = analyzer
        self.converter = converter
        self.analysisFormat = analysisFormat
        self.inputBuilder = inputBuilder
        self.resultTask = resultTask
        self.onError = onError
        self.selectedLocaleIdentifier = selectedLocaleIdentifier
    }

    static func prepare(
        localeIdentifier: String,
        naturalAudioFormat: AVAudioFormat,
        onStatus: @escaping @Sendable (String) -> Void,
        onText: @escaping @Sendable (String) -> Void,
        onError: @escaping @Sendable (Error) -> Void
    ) async throws -> ModernSpeechPipeline {
        guard SpeechTranscriber.isAvailable else { throw RecorderError.modernSpeechUnavailable }
        // The employee App is fixed to the China business policy. Do not accept
        // an English "equivalent" locale: on real hardware that can produce
        // fluent-looking English nonsense while the user is speaking Chinese.
        let requestedLocale = Locale(identifier: localeIdentifier)
        let wantsChinese = localeIdentifier
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
            .hasPrefix("zh")
        let equivalentLocale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale)
        let supportedLocales = await SpeechTranscriber.supportedLocales
        let locale: Locale
        if wantsChinese {
            if let equivalentLocale,
               equivalentLocale.identifier
                .replacingOccurrences(of: "_", with: "-")
                .lowercased()
                .hasPrefix("zh") {
                locale = equivalentLocale
            } else if let installedChinese = supportedLocales.first(where: {
                $0.identifier
                    .replacingOccurrences(of: "_", with: "-")
                    .lowercased()
                    .hasPrefix("zh")
            }) {
                locale = installedChinese
            } else {
                throw RecorderError.unsupportedSpeechLocale
            }
        } else if let equivalentLocale {
            locale = equivalentLocale
        } else {
            throw RecorderError.unsupportedSpeechLocale
        }

        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        onStatus("正在检查并准备中文语音模型…")
        if let installationRequest = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            onStatus("首次使用正在下载中文语音模型，请保持联网…")
            try await installationRequest.downloadAndInstall()
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard let analysisFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber],
            considering: naturalAudioFormat
        ) else {
            throw RecorderError.invalidInputFormat
        }
        let converter = naturalAudioFormat == analysisFormat
            ? nil
            : AVAudioConverter(from: naturalAudioFormat, to: analysisFormat)
        if naturalAudioFormat != analysisFormat, converter == nil {
            throw RecorderError.invalidInputFormat
        }
        try await analyzer.prepareToAnalyze(in: analysisFormat)
        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        // Do not inherit the caller's MainActor. A continuous recognition result
        // stream must never compete with the UI clock or SwiftUI rendering.
        let resultTask = Task.detached {
            var finalized = ""
            var volatile = ""
            var lastDelivery = Date.distantPast
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { continue }
                    if result.isFinal {
                        finalized = Self.joined(finalized, text)
                        volatile = ""
                    } else {
                        volatile = text
                    }
                    // SpeechAnalyzer can emit partial hypotheses faster than
                    // SwiftUI and the encrypted draft store need to redraw.
                    // Cap delivery at five updates per second so recognition
                    // cannot starve the page clock or button events.
                    let deliveryDelay = 0.2 - Date().timeIntervalSince(lastDelivery)
                    if deliveryDelay > 0 {
                        try? await Task.sleep(for: .seconds(deliveryDelay))
                    }
                    onText(Self.joined(finalized, volatile))
                    lastDelivery = Date()
                }
            } catch {
                onError(error)
            }
        }
        try await analyzer.start(inputSequence: inputSequence)
        onStatus("iOS 26 本机中文转写引擎已就绪，请讲话")
        return ModernSpeechPipeline(
            analyzer: analyzer,
            converter: converter,
            analysisFormat: analysisFormat,
            inputBuilder: inputBuilder,
            resultTask: resultTask,
            onError: onError,
            selectedLocaleIdentifier: locale.identifier
        )
    }

    func consume(_ buffer: AVAudioPCMBuffer) {
        guard let converter else {
            inputBuilder.yield(AnalyzerInput(buffer: buffer))
            return
        }

        let ratio = analysisFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 32
        guard let converted = AVAudioPCMBuffer(pcmFormat: analysisFormat, frameCapacity: capacity) else {
            onError(RecorderError.invalidInputFormat)
            return
        }
        let input = OneShotAudioInput(buffer: buffer)
        var conversionError: NSError?
        let conversionStatus = converter.convert(to: converted, error: &conversionError) { _, status in
            input.next(status: status)
        }
        if let conversionError {
            onError(conversionError)
            return
        }
        switch conversionStatus {
        case .haveData, .inputRanDry:
            if converted.frameLength > 0 {
                inputBuilder.yield(AnalyzerInput(buffer: converted))
            }
        case .error:
            onError(RecorderError.invalidInputFormat)
        case .endOfStream:
            break
        @unknown default:
            onError(RecorderError.invalidInputFormat)
        }
    }

    func finish() async {
        do {
            inputBuilder.finish()
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            await resultTask.value
        } catch {
            onError(error)
            await analyzer.cancelAndFinishNow()
            resultTask.cancel()
        }
    }

    func cancel() async {
        inputBuilder.finish()
        await analyzer.cancelAndFinishNow()
        resultTask.cancel()
    }

    private static func joined(_ prefix: String, _ addition: String) -> String {
        if prefix.isEmpty { return addition }
        if addition.isEmpty { return prefix }
        return prefix + "\n" + addition
    }
}

private func makeMeetingAudioTap(sink: MeetingAudioSink) -> AVAudioNodeTapBlock {
    { buffer, _ in sink.consume(buffer) }
}

private func makeMeetingRecognitionHandler(
    recorder: MeetingRecorder,
    generation: Int
) -> (SFSpeechRecognitionResult?, (any Error)?) -> Void {
    { [weak recorder] result, error in
        let text = result?.bestTranscription.formattedString
        let isFinal = result?.isFinal ?? false
        let errorValue = error.map { $0 as NSError }
        let errorDescription = errorValue?.localizedDescription
        let errorDomain = errorValue?.domain
        let errorCode = errorValue?.code
        Task { @MainActor [weak recorder, text, errorDescription, errorDomain, errorCode] in
            recorder?.handleRecognitionResult(
                text: text,
                isFinal: isFinal,
                errorDescription: errorDescription,
                errorDomain: errorDomain,
                errorCode: errorCode,
                generation: generation
            )
        }
    }
}

@MainActor
final class MeetingRecorder: ObservableObject {
    private static let logger = Logger(subsystem: "com.quadfilm.field", category: "MeetingSpeech")

    @Published private(set) var isRecording = false
    @Published private(set) var isStarting = false
    @Published private(set) var isPreparingSpeech = false
    @Published private(set) var isTranscribing = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var pendingCount = 0
    @Published private(set) var liveTranscript = ""
    @Published private(set) var inputLevel: Float = 0
    @Published private(set) var recognitionEngine = "尚未选择"
    @Published var status = "尚未开始"

    /// Includes the visit plan ID so speech from one customer can never update
    /// another customer's meeting draft after navigation changes.
    var onTranscriptUpdate: ((String, String) -> Void)?

    private let audioEngine = AVAudioEngine()
    private let audioSink = MeetingAudioSink()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognitionConnectionTask: Task<Void, Never>?
    private var recognitionRestartTask: Task<Void, Never>?
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionGeneration = 0
    private var committedTranscript = ""
    private var sessionPrefix = ""
    private var currentRecognitionText = ""
    private var recognitionFailureCount = 0
    private var modernPipeline: AnyObject?

    @Published private(set) var activePlanId: String?
    private var localeIdentifier = "zh-CN"
    private var currentSegmentURL: URL?
    private var currentSegmentId: UUID?
    private var segmentStartedAt = Date()
    private var inputFormat: AVAudioFormat?
    private var hasInputTap = false
    private var elapsedTask: Task<Void, Never>?
    private var recordingStartedAt: Date?
    private var segmentTimer: Timer?
    private var finishing = false
    private var hasLoggedAudibleInput = false
    private var hasLoggedRecognitionResult = false
    private let segmentDuration: TimeInterval = 240

    init() {
        audioSink.replaceInputLevelHandler { [weak self] level in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.inputLevel = level
                if level > 0.008, !self.hasLoggedAudibleInput {
                    self.hasLoggedAudibleInput = true
                    self.diagnose("microphone-audible-input")
                }
            }
        }
    }

    var formattedElapsed: String {
        formattedElapsed(at: Date())
    }

    func formattedElapsed(at date: Date) -> String {
        let currentElapsed = recordingStartedAt.map { date.timeIntervalSince($0) } ?? elapsed
        let total = max(Int(currentElapsed), 0)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    nonisolated func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
    }

    nonisolated func requestSpeechPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    func start(planId: String, localeIdentifier: String, existingTranscript: String) async throws {
        guard !isRecording, !isStarting else { return }
        isStarting = true
        self.activePlanId = planId
        status = "正在启动会议语音…"
        diagnose("start-requested")
        defer { isStarting = false }
        guard await requestPermission() else {
            diagnose("microphone-permission-denied")
            activePlanId = nil
            throw RecorderError.permissionDenied
        }
        guard await requestSpeechPermission() else {
            diagnose("speech-permission-denied")
            activePlanId = nil
            throw RecorderError.speechPermissionDenied
        }

        self.localeIdentifier = localeIdentifier
        committedTranscript = existingTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        currentRecognitionText = ""
        recognitionFailureCount = 0
        liveTranscript = committedTranscript
        sessionPrefix = committedTranscript
        inputLevel = 0
        elapsed = 0
        hasLoggedAudibleInput = false
        hasLoggedRecognitionResult = false

        do {
            try configureAudioSession()
            let format = audioEngine.inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw RecorderError.invalidInputFormat
            }
            inputFormat = format

            let target = try await makeSegmentTarget(inputFormat: format)
            let segmentId = UUID()
            currentSegmentURL = target.url
            currentSegmentId = segmentId
            segmentStartedAt = Date()
            try await PersistentQueues.shared.registerActiveRecording(
                id: segmentId,
                planId: planId,
                relativePath: target.url.lastPathComponent,
                createdAt: segmentStartedAt
            )
            audioSink.replaceAudioFile(with: target.file)

            audioEngine.inputNode.installTap(
                onBus: 0,
                bufferSize: 1_024,
                format: format,
                block: makeMeetingAudioTap(sink: audioSink)
            )
            hasInputTap = true
            audioEngine.prepare()
            try audioEngine.start()
            diagnose("audio-engine-started sampleRate=\(Int(format.sampleRate)) channels=\(format.channelCount)")

            isRecording = true
            recordingStartedAt = Date()
            isStarting = false
            isTranscribing = false
            status = "会议语音已开始保存 · 正在准备实时转写"
            scheduleSegmentRotation()
            scheduleElapsedTimer()

            // Return from the button action immediately. SpeechAnalyzer model
            // preparation runs asynchronously and can never freeze the timer,
            // navigation, or the durable microphone recording.
            connectRecognitionInBackground()
        } catch {
            diagnose("start-failed error=\((error as NSError).domain):\((error as NSError).code)")
            await cleanupAfterFailedStart()
            throw error
        }
    }

    func stop(reason: String = "unspecified") async {
        diagnose("stop-requested reason=\(reason) recording=\(isRecording)")
        guard isRecording, !finishing else { return }
        finishing = true
        if let recordingStartedAt {
            elapsed = Date().timeIntervalSince(recordingStartedAt)
        }
        elapsedTask?.cancel()
        elapsedTask = nil
        segmentTimer?.invalidate()
        segmentTimer = nil
        recognitionRestartTask?.cancel()
        recognitionRestartTask = nil
        recognitionConnectionTask?.cancel()
        recognitionConnectionTask = nil

        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        audioEngine.stop()
        await audioSink.drainRecognitionDelivery()
        audioSink.replaceModernInputHandler(with: nil)
        if #available(iOS 26.0, *), let pipeline = modernPipeline as? ModernSpeechPipeline {
            await pipeline.finish()
            modernPipeline = nil
        }
        commitCurrentRecognition()
        clearLegacyRecognitionSession()

        let url = currentSegmentURL
        let segmentId = currentSegmentId
        var byteCount = 0
        var completedFile = audioSink.replaceAudioFile(with: nil)
        _ = completedFile?.length
        completedFile = nil
        if let url {
            byteCount = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        }
        if let segmentId {
            try? await PersistentQueues.shared.finalizeActiveRecording(id: segmentId, byteCount: byteCount)
        }
        diagnose("stopped elapsed=\(Int(elapsed)) bytes=\(byteCount)")

        currentSegmentURL = nil
        currentSegmentId = nil
        inputFormat = nil
        isRecording = false
        isTranscribing = false
        inputLevel = 0
        recordingStartedAt = nil
        finishing = false
        status = "会议语音和文字已安全保存在本机，等待服务器确认"
        activePlanId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        await refreshPendingCount()
    }

    func continueTranscription(existingTranscript: String) async throws {
        guard isRecording, !finishing else { throw RecorderError.notRecording }
        guard !isPreparingSpeech else { return }
        isPreparingSpeech = true
        defer { isPreparingSpeech = false }

        recognitionRestartTask?.cancel()
        recognitionRestartTask = nil
        await clearRecognitionSession()

        let editedTranscript = existingTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !editedTranscript.isEmpty {
            committedTranscript = editedTranscript
        }
        sessionPrefix = committedTranscript
        currentRecognitionText = ""
        liveTranscript = committedTranscript
        recognitionFailureCount = 0

        do {
            try await beginRecognition()
            isTranscribing = true
            status = "已继续实时语音转文字 · 请继续讲话"
        } catch {
            isTranscribing = false
            status = "会议录音持续中 · 正在重新连接实时转写（录音未中断）"
            scheduleRecognitionRestart(after: .seconds(2))
            throw error
        }
    }

    func refreshPendingCount() async {
        pendingCount = await PersistentQueues.shared.recordings().count
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
    }

    private func makeSegmentTarget(inputFormat: AVAudioFormat) async throws -> (url: URL, file: AVAudioFile) {
        guard activePlanId != nil else { throw RecorderError.missingVisit }
        let url = try await PersistentQueues.shared.makeRecordingURL()
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: inputFormat.sampleRate,
            AVNumberOfChannelsKey: Int(inputFormat.channelCount),
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let file = try AVAudioFile(
            forWriting: url,
            settings: settings,
            commonFormat: inputFormat.commonFormat,
            interleaved: inputFormat.isInterleaved
        )
        return (url, file)
    }

    private func beginRecognition() async throws {
        await clearRecognitionSession()
        // SpeechAnalyzer is Apple's iOS 26 replacement for SFSpeechRecognizer
        // and is designed for long meetings and live on-device transcription.
        // Keep SFSpeechRecognizer only as a fallback when the modern engine or
        // its Chinese model is genuinely unavailable.
        if #available(iOS 26.0, *) {
            do {
                diagnose("modern-speech-connecting")
                try await beginModernRecognition()
                diagnose("modern-speech-ready")
                return
            } catch {
                let value = error as NSError
                diagnose("modern-speech-failed error=\(value.domain):\(value.code)")
            }
        }
        try beginLegacyRecognition()
        diagnose("legacy-speech-ready")
    }

    @available(iOS 26.0, *)
    private func beginModernRecognition() async throws {
        // Awaiting the detached preparation task suspends MainActor instead of
        // freezing the timer and the whole SwiftUI screen during model setup.
        recognitionGeneration += 1
        let generation = recognitionGeneration
        let requestedLocaleIdentifier = localeIdentifier
        let naturalAudioFormat = inputFormat ?? audioEngine.inputNode.outputFormat(forBus: 0)
        let pipeline = try await Task.detached(priority: .userInitiated) { [weak self] in
            try await ModernSpeechPipeline.prepare(
                localeIdentifier: requestedLocaleIdentifier,
                naturalAudioFormat: naturalAudioFormat,
                onStatus: { [weak self] value in
                    Task { @MainActor [weak self] in
                        guard let self, generation == self.recognitionGeneration else { return }
                        self.status = value
                    }
                },
                onText: { [weak self] value in
                    Task { @MainActor [weak self] in
                        self?.applyModernRecognition(value, generation: generation)
                    }
                },
                onError: { [weak self] error in
                    Task { @MainActor [weak self] in
                        self?.handleModernRecognitionFailure(error, generation: generation)
                    }
                }
            )
        }.value
        guard isRecording, generation == recognitionGeneration else {
            await pipeline.cancel()
            throw CancellationError()
        }
        modernPipeline = pipeline
        diagnose("modern-speech-locale=\(pipeline.selectedLocaleIdentifier)")
        audioSink.replaceModernInputHandler { [weak pipeline] buffer in pipeline?.consume(buffer) }
        recognitionEngine = "iOS 26 本机中文实时语音转文字"
    }

    private func beginLegacyRecognition() throws {
        clearLegacyRecognitionSession()
        guard let recognizer = makeAvailableSpeechRecognizer() else {
            throw RecorderError.speechUnavailable
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.addsPunctuation = true
        request.contextualStrings = ["客户拜访", "隔热膜", "汽车贴膜", "报价", "样品", "回访", "施工"]
        // Do not force on-device recognition merely because the device advertises
        // support. The matching Chinese model may not be installed yet. Leaving
        // this false lets Speech choose the available on-device or Apple service
        // path instead of repeatedly failing to initialize the local recognizer.
        request.requiresOnDeviceRecognition = false

        speechRecognizer = recognizer
        recognitionRequest = request
        audioSink.replaceRecognitionRequest(with: request)
        sessionPrefix = committedTranscript
        currentRecognitionText = ""
        recognitionGeneration += 1
        let generation = recognitionGeneration

        recognitionTask = recognizer.recognitionTask(
            with: request,
            resultHandler: makeMeetingRecognitionHandler(recorder: self, generation: generation)
        )
        recognitionEngine = "系统实时语音识别（即时模式）"
    }

    private func applyModernRecognition(_ text: String, generation: Int) {
        guard isRecording, generation == recognitionGeneration else { return }
        logFirstRecognitionResult(engine: "modern", text: text)
        recognitionFailureCount = 0
        currentRecognitionText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let combined = joinedTranscript(sessionPrefix, currentRecognitionText)
        liveTranscript = combined
        if let activePlanId { onTranscriptUpdate?(activePlanId, combined) }
        isTranscribing = true
        status = "本机中文实时转写中 · 音频每 4 分钟封存"
    }

    private func handleModernRecognitionFailure(_ error: Error, generation: Int) {
        guard isRecording, generation == recognitionGeneration else { return }
        recognitionFailureCount += 1
        Self.logger.error("SpeechAnalyzer failed: \(error.localizedDescription, privacy: .public)")
        isTranscribing = false
        status = "录音持续中 · 本机转写发生错误，正在重连"
        scheduleRecognitionRestart(after: recognitionRetryDelay)
    }

    fileprivate func handleRecognitionResult(
        text: String?,
        isFinal: Bool,
        errorDescription: String?,
        errorDomain: String?,
        errorCode: Int?,
        generation: Int
    ) {
        guard isRecording, generation == recognitionGeneration else { return }
        if let text, !text.isEmpty {
            logFirstRecognitionResult(engine: "legacy", text: text)
            recognitionFailureCount = 0
            applyRecognition(text)
        }
        guard isFinal || errorDescription != nil else { return }

        commitCurrentRecognition()
        clearLegacyRecognitionSession()
        isTranscribing = false
        if let errorDescription {
            recognitionFailureCount += 1
            Self.logger.error(
                "Speech recognition failed: domain=\(errorDomain ?? "unknown", privacy: .public) code=\(errorCode ?? -1) message=\(errorDescription, privacy: .public)"
            )
            status = "会议录音持续中 · 正在重新连接实时转写（录音未中断）"
            scheduleRecognitionRestart(after: recognitionRetryDelay)
        } else {
            recognitionFailureCount = 0
            status = "会议录音持续中 · 正在续接实时转写"
            scheduleRecognitionRestart(after: .milliseconds(250))
        }
    }

    private func applyRecognition(_ text: String) {
        recognitionFailureCount = 0
        currentRecognitionText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let combined = joinedTranscript(sessionPrefix, currentRecognitionText)
        liveTranscript = combined
        if let activePlanId { onTranscriptUpdate?(activePlanId, combined) }
        isTranscribing = true
        status = "实时语音转文字中 · 音频每 4 分钟封存"
    }

    private func commitCurrentRecognition() {
        let value = currentRecognitionText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty { committedTranscript = joinedTranscript(sessionPrefix, value) }
        currentRecognitionText = ""
        sessionPrefix = committedTranscript
        liveTranscript = committedTranscript
        if let activePlanId { onTranscriptUpdate?(activePlanId, committedTranscript) }
    }

    private func joinedTranscript(_ prefix: String, _ addition: String) -> String {
        let cleanPrefix = prefix.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAddition = addition.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanPrefix.isEmpty { return cleanAddition }
        if cleanAddition.isEmpty { return cleanPrefix }
        return cleanPrefix + "\n" + cleanAddition
    }

    private func connectRecognitionInBackground() {
        recognitionConnectionTask?.cancel()
        isPreparingSpeech = true
        isTranscribing = false
        status = "会议语音已开始保存 · 正在连接实时语音转文字"
        recognitionConnectionTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.beginRecognition()
                guard !Task.isCancelled, self.isRecording else {
                    await self.clearRecognitionSession()
                    return
                }
                self.isPreparingSpeech = false
                self.isTranscribing = true
                self.status = "实时语音转文字中 · 请讲话"
            } catch is CancellationError {
                self.isPreparingSpeech = false
            } catch {
                self.isPreparingSpeech = false
                guard self.isRecording else { return }
                let value = error as NSError
                self.diagnose("speech-connection-failed error=\(value.domain):\(value.code)")
                Self.logger.error("Unable to prepare speech engine: \(error.localizedDescription, privacy: .public)")
                self.isTranscribing = false
                self.status = "会议语音持续保存 · 实时转写正在自动重连"
                self.scheduleRecognitionRestart(after: .seconds(2))
            }
        }
    }

    private func logFirstRecognitionResult(engine: String, text: String) {
        guard !hasLoggedRecognitionResult else { return }
        hasLoggedRecognitionResult = true
        diagnose("first-transcript-result engine=\(engine) characters=\(text.count)")
    }

    private func diagnose(_ event: String) {
        let plan = activePlanId ?? "none"
        Task { await MeetingSpeechDiagnosticLog.shared.append("plan=\(plan) \(event)") }
    }

    private func clearRecognitionSession() async {
        audioSink.replaceModernInputHandler(with: nil)
        audioSink.replaceRecognitionRequest(with: nil)
        await audioSink.drainRecognitionDelivery()
        if #available(iOS 26.0, *), let pipeline = modernPipeline as? ModernSpeechPipeline {
            await pipeline.cancel()
            modernPipeline = nil
        }
        clearLegacyRecognitionSession()
        recognitionEngine = "尚未选择"
    }

    private func clearLegacyRecognitionSession() {
        recognitionGeneration += 1
        audioSink.replaceRecognitionRequest(with: nil)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        speechRecognizer = nil
    }

    private func scheduleRecognitionRestart(after delay: Duration) {
        recognitionRestartTask?.cancel()
        recognitionRestartTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard let self, self.isRecording else { return }
            self.isPreparingSpeech = true
            do {
                try await self.beginRecognition()
                self.isPreparingSpeech = false
                self.isTranscribing = true
                self.status = "实时语音转文字已连接 · 请继续讲话"
            } catch {
                self.isPreparingSpeech = false
                self.recognitionFailureCount += 1
                Self.logger.error("Unable to create speech recognizer: \(error.localizedDescription, privacy: .public)")
                self.isTranscribing = false
                self.status = "会议录音持续中 · 正在重新连接实时转写（录音未中断）"
                self.scheduleRecognitionRestart(after: self.recognitionRetryDelay)
            }
        }
    }

    private var recognitionRetryDelay: Duration {
        .seconds(min(15, max(2, recognitionFailureCount * 2)))
    }

    private func makeAvailableSpeechRecognizer() -> SFSpeechRecognizer? {
        let preferred = Locale(identifier: localeIdentifier)
        let candidates = [preferred, Locale(identifier: "zh_CN"), Locale(identifier: "zh-Hans-CN")]
        var seen = Set<String>()
        for locale in candidates where seen.insert(locale.identifier).inserted {
            if let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable {
                return recognizer
            }
        }
        return nil
    }

    private func scheduleElapsedTimer() {
        elapsedTask?.cancel()
        elapsedTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard let self, self.isRecording, let startedAt = self.recordingStartedAt else { return }
                // Compute from the real start instant instead of adding one per
                // run-loop tick. This catches up correctly after scrolling,
                // keyboard tracking, background suspension, or transient UI load.
                self.elapsed = Date().timeIntervalSince(startedAt)
                if let failure = self.audioSink.takeWriteFailure() {
                    let value = failure as NSError
                    self.diagnose("audio-write-failure error=\(value.domain):\(value.code)")
                    await self.stop(reason: "audio-write-failure")
                    self.status = "语音采集已停止：\(failure.localizedDescription)"
                    return
                }
            }
        }
    }

    private func scheduleSegmentRotation() {
        segmentTimer?.invalidate()
        segmentTimer = .scheduledTimer(withTimeInterval: segmentDuration, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in await self?.rotateSegment() }
        }
    }

    private func rotateSegment() async {
        guard isRecording, !finishing, let format = inputFormat else { return }
        do {
            let nextTarget = try await makeSegmentTarget(inputFormat: format)
            guard let planId = activePlanId else { return }
            let nextSegmentId = UUID()
            let nextStartedAt = Date()
            try await PersistentQueues.shared.registerActiveRecording(
                id: nextSegmentId,
                planId: planId,
                relativePath: nextTarget.url.lastPathComponent,
                createdAt: nextStartedAt
            )
            let previousURL = currentSegmentURL
            let previousSegmentId = currentSegmentId
            var previousFile = audioSink.replaceAudioFile(with: nextTarget.file)
            currentSegmentURL = nextTarget.url
            currentSegmentId = nextSegmentId
            segmentStartedAt = nextStartedAt
            _ = previousFile?.length
            previousFile = nil
            let previousByteCount = previousURL.flatMap {
                try? $0.resourceValues(forKeys: [.fileSizeKey]).fileSize
            } ?? 0
            if let previousSegmentId {
                try await PersistentQueues.shared.finalizeActiveRecording(
                    id: previousSegmentId,
                    byteCount: previousByteCount
                )
            }
            status = isTranscribing
                ? "实时语音转文字中 · 上一音频分段已封存"
                : "会议录音持续中 · 上一音频分段已封存"
            scheduleSegmentRotation()
            await refreshPendingCount()
        } catch {
            let value = error as NSError
            diagnose("segment-rotation-failed error=\(value.domain):\(value.code)")
            await stop(reason: "segment-rotation-failure")
            status = "语音分段保存失败：\(error.localizedDescription)"
        }
    }

    private func cleanupAfterFailedStart() async {
        recognitionConnectionTask?.cancel()
        recognitionConnectionTask = nil
        recognitionRestartTask?.cancel()
        recognitionRestartTask = nil
        if audioEngine.isRunning { audioEngine.stop() }
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        audioSink.replaceModernInputHandler(with: nil)
        audioSink.replaceRecognitionRequest(with: nil)
        await audioSink.drainRecognitionDelivery()
        if #available(iOS 26.0, *), let pipeline = modernPipeline as? ModernSpeechPipeline {
            Task { await pipeline.cancel() }
            modernPipeline = nil
        }
        clearLegacyRecognitionSession()
        let file = audioSink.replaceAudioFile(with: nil)
        _ = file?.length
        if let currentSegmentId {
            try? await PersistentQueues.shared.abandonActiveRecording(id: currentSegmentId)
        }
        currentSegmentURL = nil
        currentSegmentId = nil
        inputFormat = nil
        activePlanId = nil
        isRecording = false
        isStarting = false
        isPreparingSpeech = false
        isTranscribing = false
        inputLevel = 0
        elapsedTask?.cancel()
        elapsedTask = nil
        recordingStartedAt = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

enum RecorderError: LocalizedError {
    case permissionDenied, speechPermissionDenied, speechUnavailable, missingVisit
    case invalidInputFormat, cannotPrepare, cannotStart, notRecording
    case modernSpeechUnavailable, unsupportedSpeechLocale

    var errorDescription: String? {
        switch self {
        case .permissionDenied: "未授权麦克风，请在系统设置中允许"
        case .speechPermissionDenied: "未授权语音识别，请在系统设置中允许"
        case .speechUnavailable: "当前语音识别服务暂不可用"
        case .missingVisit: "请先选择拜访客户"
        case .invalidInputFormat: "当前麦克风音频格式不可用"
        case .cannotPrepare: "语音文件准备失败"
        case .cannotStart: "语音转写启动失败"
        case .notRecording: "当前没有正在进行的会议录音"
        case .modernSpeechUnavailable: "当前设备不支持 iOS 26 本机语音转文字"
        case .unsupportedSpeechLocale: "当前设备不支持简体中文语音模型"
        }
    }
}
