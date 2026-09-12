import SwiftUI

@main
struct LidaFieldApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var app: AppState
    @State private var didRunPreviewAction = false

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        let shellPreview = arguments.contains("-app-shell-preview")
        let preview = arguments.contains("-design-preview") || shellPreview
        let page: DesignPreviewPage = {
            guard let index = arguments.firstIndex(of: "-preview-page"),
                  arguments.indices.contains(index + 1) else { return .home }
            return DesignPreviewPage(rawValue: arguments[index + 1]) ?? .home
        }()
        let previewRegionCode: String? = {
            guard let index = arguments.firstIndex(of: "-preview-region"),
                  arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }()
        let previewPlanIndex: Int = {
            guard let index = arguments.firstIndex(of: "-preview-plan-index"),
                  arguments.indices.contains(index + 1) else { return 0 }
            return Int(arguments[index + 1]) ?? 0
        }()
        _app = StateObject(
            wrappedValue: AppState(
                designPreview: preview,
                previewPage: page,
                showsAppShellPreview: shellPreview,
                previewRegionCode: previewRegionCode,
                previewPlanIndex: previewPlanIndex
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .task {
                    await app.restoreSession()
                    await app.applicationDidBecomeActive()
                    guard app.isDesignPreview, !didRunPreviewAction else { return }
                    didRunPreviewAction = true
                    let arguments = ProcessInfo.processInfo.arguments
                    if arguments.contains("-preview-run-clock-in") {
                        await app.clockIn()
                    } else if arguments.contains("-preview-run-clock-out") {
                        await app.clockOut()
                    } else if arguments.contains("-preview-run-one-tap-update") {
                        await app.updateWholeSystem()
                    } else if arguments.contains("-preview-run-meeting-recording") {
                        let plan = app.selectedPlan
                        app.prepareMeetingDraft(for: plan)
                        await app.startRecording(for: plan)
                        do { try await Task.sleep(for: .seconds(12)) } catch { return }
                        await app.stopRecording(for: plan)
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        Task { await app.applicationDidBecomeActive() }
                    } else {
                        app.persistMeetingDraftsForLifecycle()
                    }
                }
        }
    }
}
