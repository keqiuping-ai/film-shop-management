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

@MainActor
final class ChatVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?

    func start() async throws {
        guard !isRecording else { return }
        let permitted = await chatMicrophonePermission()
        guard permitted else { throw RecorderError.permissionDenied }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("站内语音-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let value = try AVAudioRecorder(url: url, settings: settings)
        value.delegate = self
        guard value.prepareToRecord(), value.record() else { throw RecorderError.cannotStart }
        recorder = value
        elapsed = 0
        isRecording = true
        timer = .scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.elapsed += 1 }
        }
    }

    func stop() throws -> ChatMediaDraft? {
        guard let recorder, isRecording else { return nil }
        let duration = recorder.currentTime
        recorder.stop()
        timer?.invalidate()
        timer = nil
        self.recorder = nil
        isRecording = false
        elapsed = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        let data = try Data(contentsOf: recorder.url)
        try? FileManager.default.removeItem(at: recorder.url)
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
        recorder?.stop()
        if let url = recorder?.url { try? FileManager.default.removeItem(at: url) }
        recorder = nil
        timer?.invalidate()
        timer = nil
        isRecording = false
        elapsed = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        guard !flag else { return }
        Task { @MainActor [weak self] in self?.cancel() }
    }
}

@MainActor
final class ChatSpeechInput: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var transcript = ""

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func start(localeIdentifier: String, existingText: String) async throws {
        guard !isListening else { return }
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

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
            request.append(buffer)
        }

        let prefix = existingText.trimmingCharacters(in: .whitespacesAndNewlines)
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    let recognized = result.bestTranscription.formattedString
                    self.transcript = prefix.isEmpty ? recognized : prefix + " " + recognized
                    if result.isFinal { self.stop() }
                } else if error != nil {
                    self.stop()
                }
            }
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        audioEngine.prepare()
        try audioEngine.start()
        isListening = true
    }

    func stop() {
        guard isListening || recognitionRequest != nil else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
