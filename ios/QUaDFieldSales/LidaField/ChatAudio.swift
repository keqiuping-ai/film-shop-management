import AVFoundation
import Foundation
import Speech

private func chatMicrophonePermission() async -> Bool {
    await withCheckedContinuation { continuation in
        AVAudioApplication.requestRecordPermission { permitted in
            continuation.resume(returning: permitted)
        }
    }
}

private func chatSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { status in
            continuation.resume(returning: status)
        }
    }
}

// AVAudioEngine invokes tap blocks on a realtime audio queue. Creating that
// block inside ChatSpeechInput.start() (which is @MainActor) makes Swift attach
// main-actor isolation to the block. iOS 26 then traps when the audio queue
// invokes it. Build the callback in nonisolated file scope, just like the
// meeting recorder's stable audio tap.
private func makeChatSpeechAudioTap(
    request: SFSpeechAudioBufferRecognitionRequest
) -> AVAudioNodeTapBlock {
    { buffer, _ in request.append(buffer) }
}

private func makeChatSpeechRecognitionHandler(
    input: ChatSpeechInput,
    prefix: String,
    generation: Int
) -> (SFSpeechRecognitionResult?, (any Error)?) -> Void {
    { [weak input] result, error in
        let recognized = result?.bestTranscription.formattedString
        let isFinal = result?.isFinal ?? false
        let errorValue = error.map { $0 as NSError }
        let errorDomain = errorValue?.domain
        let errorCode = errorValue?.code
        let errorDescription = errorValue?.localizedDescription
        Task { @MainActor [weak input, recognized, isFinal, errorDomain, errorCode, errorDescription, prefix] in
            input?.receiveRecognitionResult(
                recognized,
                isFinal: isFinal,
                errorDomain: errorDomain,
                errorCode: errorCode,
                errorDescription: errorDescription,
                prefix: prefix,
                generation: generation
            )
        }
    }
}

private final class ChatVoiceAudioSink: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var writeFailure: Error?

    func replaceFile(with value: AVAudioFile?) {
        lock.lock()
        file = value
        lock.unlock()
    }

    func consume(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        defer { lock.unlock() }
        do {
            try file?.write(from: buffer)
        } catch {
            writeFailure = error
        }
    }

    func takeWriteFailure() -> Error? {
        lock.lock()
        defer { lock.unlock() }
        let value = writeFailure
        writeFailure = nil
        return value
    }
}

private func makeChatVoiceAudioTap(sink: ChatVoiceAudioSink) -> AVAudioNodeTapBlock {
    { buffer, _ in sink.consume(buffer) }
}

@MainActor
final class ChatVoiceRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0

    private let audioEngine = AVAudioEngine()
    private let audioSink = ChatVoiceAudioSink()
    private var hasInputTap = false
    private var recordingURL: URL?
    private var recordingStartedAt: Date?
    private var timer: Timer?

    func start() async throws {
        guard !isRecording else { return }
        let permitted = await chatMicrophonePermission()
        guard permitted else { throw RecorderError.permissionDenied }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw RecorderError.invalidInputFormat
            }

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("站内语音-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: Int(format.channelCount),
                AVEncoderBitRateKey: 64_000,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]
            let file = try AVAudioFile(
                forWriting: url,
                settings: settings,
                commonFormat: format.commonFormat,
                interleaved: format.isInterleaved
            )
            audioSink.replaceFile(with: file)
            inputNode.installTap(
                onBus: 0,
                bufferSize: 1_024,
                format: format,
                block: makeChatVoiceAudioTap(sink: audioSink)
            )
            hasInputTap = true
            audioEngine.prepare()
            try audioEngine.start()

            recordingURL = url
            recordingStartedAt = Date()
            elapsed = 0
            isRecording = true
            timer = .scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.elapsed += 1 }
            }
        } catch {
            tearDownCapture(removeFile: true)
            throw error
        }
    }

    func stop() throws -> ChatMediaDraft? {
        guard let url = recordingURL, isRecording else { return nil }
        let duration = recordingStartedAt.map { Date().timeIntervalSince($0) } ?? elapsed
        tearDownCapture(removeFile: false)
        if let failure = audioSink.takeWriteFailure() { throw failure }
        let data = try Data(contentsOf: url)
        try? FileManager.default.removeItem(at: url)
        guard !data.isEmpty else { return nil }
        return ChatMediaDraft(
            kind: .voice,
            data: data,
            fileName: "站内语音-\(Date().ISO8601Format()).m4a",
            contentType: "audio/mp4",
            duration: duration
        )
    }

    func cancel() {
        tearDownCapture(removeFile: true)
    }

    private func tearDownCapture(removeFile: Bool) {
        if audioEngine.isRunning { audioEngine.stop() }
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        audioSink.replaceFile(with: nil)
        if removeFile, let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }
        recordingURL = nil
        recordingStartedAt = nil
        timer?.invalidate()
        timer = nil
        isRecording = false
        elapsed = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

@MainActor
final class ChatSpeechInput: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var transcript = ""
    @Published private(set) var errorMessage: String?

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isStarting = false
    private var hasInputTap = false
    private var recognitionGeneration = 0

    func start(localeIdentifier: String, existingText: String) async throws {
        guard !isListening, !isStarting else { return }
        isStarting = true
        defer { isStarting = false }
        errorMessage = nil

        let speechStatus = await chatSpeechAuthorization()
        guard speechStatus == .authorized else {
            throw APIError.message("未授权语音识别，请在系统设置中允许")
        }
        let microphoneAllowed = await chatMicrophonePermission()
        guard microphoneAllowed else { throw RecorderError.permissionDenied }

        recognitionTask?.cancel()
        recognitionTask = nil
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier))
        guard let recognizer, recognizer.isAvailable else {
            throw APIError.message("当前语音识别服务不可用")
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request
        transcript = existingText

        do {
            // Activate the recording session before reading the hardware format.
            // A route change can otherwise expose a 0 Hz / 0-channel format, and
            // AVAudioEngine terminates the process when installTap receives it.
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw RecorderError.invalidInputFormat
            }
            if hasInputTap {
                inputNode.removeTap(onBus: 0)
                hasInputTap = false
            }
            inputNode.installTap(
                onBus: 0,
                bufferSize: 1_024,
                format: format,
                block: makeChatSpeechAudioTap(request: request)
            )
            hasInputTap = true

            let prefix = existingText.trimmingCharacters(in: .whitespacesAndNewlines)
            recognitionGeneration += 1
            let generation = recognitionGeneration
            recognitionTask = recognizer.recognitionTask(
                with: request,
                resultHandler: makeChatSpeechRecognitionHandler(
                    input: self,
                    prefix: prefix,
                    generation: generation
                )
            )

            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
        } catch {
            resetAudioCapture()
            throw error
        }
    }

    func stop() {
        guard isListening || recognitionRequest != nil || hasInputTap else { return }
        recognitionGeneration += 1
        resetAudioCapture()
    }

    fileprivate func receiveRecognitionResult(
        _ recognized: String?,
        isFinal: Bool,
        errorDomain: String?,
        errorCode: Int?,
        errorDescription: String?,
        prefix: String,
        generation: Int
    ) {
        guard generation == recognitionGeneration else { return }
        if let recognized {
            transcript = prefix.isEmpty ? recognized : prefix + " " + recognized
            if isFinal { stop() }
        } else if let errorDomain, let errorCode {
            let detail = errorDescription ?? "unknown"
            print("[ChatSpeech] recognition failed domain=\(errorDomain) code=\(errorCode) detail=\(detail)")
            errorMessage = errorDomain == "kAFAssistantErrorDomain" && errorCode == 1110
                ? "未检测到语音，请靠近麦克风后重试"
                : "语音转写失败（\(errorDomain) \(errorCode)）"
            stop()
        }
    }

    private func resetAudioCapture() {
        audioEngine.stop()
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
