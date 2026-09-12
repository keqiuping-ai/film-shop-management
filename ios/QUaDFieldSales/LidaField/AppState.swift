import Foundation
import CoreLocation

@MainActor
final class AppState: ObservableObject {
    @Published var user: UserProfile?
    @Published var dashboard: FieldDashboard?
    @Published var customers: [CustomerSummary] = []
    @Published var selectedVisit: VisitPlan?
    @Published var activeTripConflict: ActiveTripConflict?
    @Published var selectedCustomerIDs: Set<String> = []
    @Published private(set) var completedArtifactsByPlan: [String: Set<String>] = [:]
    @Published var isBusy = false
    @Published private(set) var isSavingVisitPlans = false
    @Published private(set) var deletingVisitPlanIDs: Set<String> = []
    @Published var errorMessage = ""
    @Published var successMessage = ""
    @Published private(set) var meetingDrafts: [String: MeetingDraft] = [:]
    @Published private(set) var completedMeetingPlanIDs: Set<String> = []
    @Published private(set) var pendingMeetingAnalysisPlanIDs: Set<String> = []
    @Published private(set) var activeMeetingAnalysisPlanIDs: Set<String> = []
    @Published var region = RegionalConfiguration.china
    @Published var appVersionState: AppVersionState = .notConfigured
    @Published var lastBusinessRefreshAt: Date?
    @Published var businessRefreshStatus = "等待首次更新"
    @Published var isRefreshingBusinessData = false
    @Published var internalMessages: [InternalMessage] = []
    @Published private(set) var pendingInternalMessages: [PendingInternalMessage] = []
    @Published var internalMessageUsers: [InternalMessageUser] = []
    @Published private(set) var internalMessageAvatarData: [String: Data] = [:]
    @Published var isLoadingMessages = false
    @Published var profileDisplayName = ""
    @Published var profileAvatarData: Data?
    @Published var isAttendanceBusy = false
    @Published var attendanceActionStatus = ""
    @Published var interfaceLanguage = InterfaceLanguage.saved

    let recorder = MeetingRecorder()
    let location = LocationTracker()
    let isDesignPreview: Bool
    let showsAppShellPreview: Bool
    let previewPage: DesignPreviewPage
    private let api = APIClient.shared
    private var automaticRefreshTask: Task<Void, Never>?
    private var meetingDraftSaveTasks: [String: Task<Void, Never>] = [:]
    private var internalMessageAvatarAttachmentIDs: [String: String] = [:]
    private var internalMessageDeliveryTasks: [String: Task<Void, Never>] = [:]
    private var isFlushingVisitPlans = false
    private var isFlushingRecordings = false

    private static let customerDirectoryManagerRoles: Set<String> = [
        "owner", "manager"
    ]

    var canViewAllCustomers: Bool {
        let roles = Set(user?.roles ?? [])
        return !roles.isDisjoint(with: Self.customerDirectoryManagerRoles)
    }

    var customerDirectoryTitle: String {
        canViewAllCustomers ? "企业全部客户" : "我的客户"
    }

    var customerDirectorySubtitle: String {
        canViewAllCustomers ? "按管理权限查看企业客户" : "只显示我本人录入的客户"
    }

    init(
        designPreview: Bool = false,
        previewPage: DesignPreviewPage = .home,
        showsAppShellPreview: Bool = false,
        previewRegionCode: String? = nil,
        previewPlanIndex: Int = 0
    ) {
        self.isDesignPreview = designPreview
        self.showsAppShellPreview = showsAppShellPreview
        self.previewPage = previewPage
        location.onPoint = { [weak self] _ in Task { await self?.flushLocationQueue() } }
        recorder.onTranscriptUpdate = { [weak self] planId, value in
            self?.updateMeetingTranscript(value, planId: planId)
        }
        if designPreview {
            user = PreviewData.user
            profileDisplayName = PreviewData.user.displayName ?? PreviewData.user.loginName ?? "员工账号"
            region = RegionalConfiguration.resolve(user: PreviewData.user, explicitRegionCode: previewRegionCode)
            dashboard = PreviewData.dashboard(for: region)
            if ProcessInfo.processInfo.arguments.contains("-preview-clocked-out"), let current = dashboard {
                dashboard = FieldDashboard(
                    workDate: current.workDate,
                    trackingIntervalSeconds: current.trackingIntervalSeconds,
                    activeShift: nil,
                    shifts: current.shifts,
                    todayCustomers: current.todayCustomers,
                    route: current.route
                )
            }
            if ProcessInfo.processInfo.arguments.contains("-preview-persist-attendance"), let current = dashboard {
                dashboard = reconciledDashboard(current)
            }
            customers = ProcessInfo.processInfo.arguments.contains("-preview-nearby-jiujiang")
                ? PreviewData.jiujiangCustomers
                : PreviewData.customers(for: region)
            let previewPlans = dashboard?.todayCustomers ?? []
            selectedVisit = previewPlans.indices.contains(previewPlanIndex)
                ? previewPlans[previewPlanIndex]
                : previewPlans.first
            selectedCustomerIDs = Set(customers.prefix(3).map(\.customerId))
            let unfinishedVisitPreview = ProcessInfo.processInfo.arguments.contains("-preview-unfinished-visit")
            for (index, previewPlan) in previewPlans.enumerated() {
                completedArtifactsByPlan[previewPlan.planId] = unfinishedVisitPreview
                    ? []
                    : ["arrival", "photos", "meeting", "samples", "order", "receipt", "follow-up"]
                meetingDrafts[previewPlan.planId] = MeetingDraft(
                    transcript: index == 0
                        ? "客户主要使用陶瓷隔热膜，希望先测试 QD15；测试通过后再讨论批量价格。"
                        : "\(previewPlan.customerName) 的独立会议草稿；不会出现在其他客户记录中。",
                    aiResult: index == 0
                        ? "客户需求：测试 QD15 的隔热效果与施工稳定性。\n本次结果：留下 2 卷样品并约定下周回访。\n价格反馈：希望收到正式价格表。\n下一步：9 月 4 日回访测试结果。"
                        : "本分析仅属于 \(previewPlan.customerName)。",
                    updatedAt: Date()
                )
                completedMeetingPlanIDs.insert(previewPlan.planId)
            }
            internalMessages = PreviewData.internalMessages
            internalMessageUsers = PreviewData.internalUsers
        }
    }

    var isAuthenticated: Bool { user != nil }

    func setInterfaceLanguage(_ language: InterfaceLanguage) {
        guard interfaceLanguage != language else { return }
        interfaceLanguage = language
        UserDefaults.standard.set(language.rawValue, forKey: InterfaceLanguage.storageKey)
    }

    func localized(cn: String, us: String) -> String {
        interfaceLanguage == .english ? us : cn
    }
    var activePlans: [VisitPlan] { dashboard?.todayCustomers ?? [] }
    var selectedPlan: VisitPlan { selectedVisit ?? activePlans.first ?? PreviewData.plans[0] }
    var internalUnreadCount: Int {
        internalMessages.filter { $0.received == 1 && $0.viewerStatus == "UNREAD" }.count
    }

    func isArtifactComplete(planId: String, kind: String) -> Bool {
        completedArtifactsByPlan[planId]?.contains(kind) == true
    }

    private func markArtifactComplete(planId: String, kind: String) {
        completedArtifactsByPlan[planId, default: []].insert(kind)
    }

    func prepareMeetingDraft(for plan: VisitPlan) {
        guard meetingDrafts[plan.planId] == nil else { return }
        if !isDesignPreview,
           let identifier = profileStoreIdentifier,
           let saved = MeetingDraftStore.load(userIdentifier: identifier, planId: plan.planId) {
            meetingDrafts[plan.planId] = saved
            if !saved.aiResult.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                completedMeetingPlanIDs.insert(plan.planId)
            }
        } else {
            meetingDrafts[plan.planId] = MeetingDraft()
        }
    }

    func meetingTranscript(for planId: String) -> String {
        meetingDrafts[planId]?.transcript ?? ""
    }

    func meetingAnalysis(for planId: String) -> String {
        meetingDrafts[planId]?.aiResult ?? ""
    }

    func meetingAnalysisStatus(for planId: String) -> String {
        if activeMeetingAnalysisPlanIDs.contains(planId) { return "AI 总结生成中" }
        if pendingMeetingAnalysisPlanIDs.contains(planId) { return "等待联网自动总结" }
        return meetingAnalysis(for: planId).isEmpty ? "录音结束后自动生成" : "已生成"
    }

    func isMeetingAnalysisRunning(for planId: String) -> Bool {
        activeMeetingAnalysisPlanIDs.contains(planId)
    }

    func updateMeetingTranscript(_ value: String, planId: String) {
        var draft = meetingDrafts[planId] ?? MeetingDraft()
        guard draft.transcript != value else { return }
        draft.transcript = value
        draft.aiResult = ""
        draft.updatedAt = Date()
        meetingDrafts[planId] = draft
        completedMeetingPlanIDs.remove(planId)
        scheduleMeetingDraftSave(planId: planId)
    }

    func persistMeetingDraft(for planId: String) {
        guard !isDesignPreview,
              let identifier = profileStoreIdentifier,
              let draft = meetingDrafts[planId] else { return }
        meetingDraftSaveTasks[planId]?.cancel()
        meetingDraftSaveTasks[planId] = nil
        do {
            try MeetingDraftStore.save(draft, userIdentifier: identifier, planId: planId)
        } catch {
            errorMessage = "会议草稿本地保存失败：\(error.localizedDescription)"
        }
    }

    func persistMeetingDraftsForLifecycle() {
        persistAllMeetingDrafts()
    }

    func isMeetingComplete(planId: String) -> Bool {
        completedMeetingPlanIDs.contains(planId)
    }

    private func scheduleMeetingDraftSave(planId: String) {
        guard !isDesignPreview else { return }
        guard meetingDraftSaveTasks[planId] == nil else { return }
        meetingDraftSaveTasks[planId] = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            guard let self, !Task.isCancelled else { return }
            self.persistMeetingDraft(for: planId)
        }
    }

    private func persistAllMeetingDrafts() {
        for planId in meetingDrafts.keys { persistMeetingDraft(for: planId) }
    }

    func restoreSession() async {
        guard !isDesignPreview, let token = TokenStore.load() else { return }
        await api.setToken(token)
        do {
            user = try await api.me()
        } catch {
            if case APIError.unauthorized = error {
                TokenStore.delete()
                await api.setToken(nil)
            } else {
                errorMessage = "登录状态验证失败：\(error.localizedDescription)"
            }
            return
        }

        loadProfilePresentation()
        region = RegionalConfiguration.resolve(user: user)
        await api.setRegionalConfiguration(region)
        loadPendingMeetingAnalysisState()
        resumeNativeServices()
        _ = await refreshBusinessData(showCompletion: false)
        startAutomaticBusinessRefresh()
    }

    func login(account: String, password: String) async {
        isBusy = true
        errorMessage = ""
        defer { isBusy = false }
        do {
            let response = try await api.login(account: account, password: password)
            try TokenStore.save(response.accessToken)
            user = response.user
            loadProfilePresentation()
            region = RegionalConfiguration.resolve(user: response.user)
            await api.setRegionalConfiguration(region)
            _ = await refreshBusinessData(showCompletion: false)
            resumeNativeServices()
            loadPendingMeetingAnalysisState()
            startAutomaticBusinessRefresh()
        } catch { errorMessage = error.localizedDescription }
    }

    func logout() async {
        stopAutomaticBusinessRefresh()
        if recorder.isRecording { await recorder.stop() }
        persistAllMeetingDrafts()
        meetingDraftSaveTasks.values.forEach { $0.cancel() }
        meetingDraftSaveTasks = [:]
        location.stop()
        TokenStore.delete()
        await api.setToken(nil)
        user = nil
        dashboard = nil
        customers = []
        selectedCustomerIDs = []
        internalMessages = []
        internalMessageDeliveryTasks.values.forEach { $0.cancel() }
        internalMessageDeliveryTasks = [:]
        pendingInternalMessages = []
        internalMessageUsers = []
        internalMessageAvatarData = [:]
        internalMessageAvatarAttachmentIDs = [:]
        meetingDrafts = [:]
        pendingMeetingAnalysisPlanIDs = []
        activeMeetingAnalysisPlanIDs = []
        completedMeetingPlanIDs = []
        profileDisplayName = ""
        profileAvatarData = nil
        isAttendanceBusy = false
        attendanceActionStatus = ""
    }

    var displayedProfileName: String {
        let saved = profileDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !saved.isEmpty { return saved }
        return user?.displayName ?? user?.loginName ?? "员工账号"
    }

    func saveProfilePresentation(displayName: String, avatarData: Data?) async -> Bool {
        guard let identifier = profileStoreIdentifier else {
            errorMessage = "当前账号资料尚未加载"
            return false
        }
        let normalizedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty else {
            errorMessage = "姓名不能为空"
            return false
        }
        do {
            try ProfilePresentationStore.save(
                identifier: identifier,
                displayName: normalizedName,
                avatarData: avatarData
            )
            profileDisplayName = normalizedName
            profileAvatarData = avatarData
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        guard !isDesignPreview, let userId = user?.userId else {
            successMessage = "头像与姓名已保存"
            return true
        }
        do {
            user = try await api.updateProfile(displayName: normalizedName)
            if let avatarData {
                let uploaded = try await api.uploadAttachment(
                    objectId: userId,
                    fileName: "profile-avatar.jpg",
                    contentType: "image/jpeg",
                    data: avatarData,
                    module: "profile-avatar"
                )
                let verified = try await api.attachments(
                    objectId: userId,
                    module: "profile-avatar"
                )
                guard verified.items.contains(where: {
                    $0.attachmentId == uploaded.attachmentId
                        && $0.sizeBytes == avatarData.count
                }) else {
                    throw APIError.message("服务器未确认完整头像文件")
                }
            } else {
                let existing = try await api.attachments(objectId: userId, module: "profile-avatar")
                for item in existing.items {
                    _ = try await api.archiveAttachment(item.attachmentId, module: "profile-avatar")
                }
            }
            let overview = try await api.collaborationOverview()
            await applyInternalMessageOverview(overview)
            successMessage = "头像与姓名已同步到企业系统"
            return true
        } catch {
            errorMessage = "资料已保存到当前 iPhone，但企业系统同步失败：\(error.localizedDescription)"
            return false
        }
    }

    func updateLoginAccount(_ requestedLoginName: String) async -> Bool {
        let normalized = requestedLoginName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            errorMessage = "登录账号不能为空"
            return false
        }
        guard normalized != user?.loginName else {
            errorMessage = "新的登录账号与当前账号相同"
            return false
        }
        guard let current = user,
              let userId = current.userId,
              let roles = current.roles,
              !roles.isEmpty else {
            errorMessage = "当前账号资料不完整，无法修改登录账号"
            return false
        }
        if isDesignPreview {
            errorMessage = "预览模式不会修改服务器登录账号"
            return false
        }

        isBusy = true
        errorMessage = ""
        defer { isBusy = false }
        do {
            _ = try await api.updateLoginAccount(
                userId: userId,
                loginName: normalized,
                roles: roles,
                department: current.department,
                position: current.position
            )
            await logout()
            errorMessage = "登录账号已修改。请使用新账号“\(normalized)”重新登录。"
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func changePassword(currentPassword: String, newPassword: String) async -> Bool {
        guard !currentPassword.isEmpty else {
            errorMessage = "请输入当前密码"
            return false
        }
        guard newPassword.count >= 10 else {
            errorMessage = "新密码至少需要 10 个字符"
            return false
        }
        guard currentPassword != newPassword else {
            errorMessage = "新密码不能与当前密码相同"
            return false
        }
        if isDesignPreview {
            errorMessage = "预览模式不会修改服务器密码"
            return false
        }

        isBusy = true
        errorMessage = ""
        defer { isBusy = false }
        do {
            let response = try await api.changePassword(
                currentPassword: currentPassword,
                newPassword: newPassword
            )
            guard response.passwordChanged, response.signInRequired else {
                throw APIError.message("服务器没有确认密码修改")
            }
            await logout()
            errorMessage = "密码已修改，其他登录会话已失效。请使用新密码重新登录。"
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private var profileStoreIdentifier: String? {
        user?.userId ?? user?.loginName
    }

    private func loadProfilePresentation() {
        guard let identifier = profileStoreIdentifier else {
            profileDisplayName = ""
            profileAvatarData = nil
            return
        }
        profileDisplayName = ProfilePresentationStore.displayName(identifier: identifier)
            ?? user?.displayName
            ?? user?.loginName
            ?? "员工账号"
        profileAvatarData = ProfilePresentationStore.avatarData(identifier: identifier)
    }

    func refreshDashboard() async throws {
        if isDesignPreview {
            let preview = PreviewData.dashboard(for: region)
            dashboard = shouldPersistAttendanceState ? reconciledDashboard(preview) : preview
            return
        }
        let date = APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier)
        dashboard = try await api.dashboard(date: date)
        resumeNativeServices()
    }

    func dashboard(for date: Date) async throws -> FieldDashboard {
        if isDesignPreview { return PreviewData.dashboard(for: region) }
        let dateKey = APIClient.localDate(date, timeZoneIdentifier: region.timeZoneIdentifier)
        let todayKey = APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier)
        let remote = try await api.dashboard(date: dateKey)
        if dateKey == todayKey {
            dashboard = remote
            resumeNativeServices()
        }
        return remote
    }

    func loadCustomers() async {
        if isDesignPreview {
            customers = ProcessInfo.processInfo.arguments.contains("-preview-nearby-jiujiang")
                ? PreviewData.jiujiangCustomers
                : PreviewData.customers(for: region)
            return
        }
        do { customers = scopedCustomers(try await api.customers()) }
        catch { errorMessage = error.localizedDescription }
    }

    func loadInternalMessages() async {
        if isDesignPreview {
            internalMessages = PreviewData.internalMessages
            internalMessageUsers = PreviewData.internalUsers
            return
        }
        guard !isLoadingMessages else { return }
        isLoadingMessages = true
        defer { isLoadingMessages = false }
        do {
            let overview = try await api.collaborationOverview()
            await applyInternalMessageOverview(overview)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func applyInternalMessageOverview(_ overview: CollaborationOverview) async {
        internalMessages = overview.messages
        internalMessageUsers = overview.users.filter { $0.userId != user?.userId }
        let activeUserIDs = Set(overview.users.map(\.userId))
        internalMessageAvatarData = internalMessageAvatarData.filter { activeUserIDs.contains($0.key) }
        internalMessageAvatarAttachmentIDs = internalMessageAvatarAttachmentIDs.filter { activeUserIDs.contains($0.key) }

        for messageUser in overview.users {
            if let inlineAvatarData = messageUser.inlineAvatarData {
                internalMessageAvatarData[messageUser.userId] = inlineAvatarData
                internalMessageAvatarAttachmentIDs.removeValue(forKey: messageUser.userId)
                if messageUser.userId == user?.userId {
                    profileAvatarData = inlineAvatarData
                }
                continue
            }
            guard let attachmentId = messageUser.avatarAttachmentId, !attachmentId.isEmpty else {
                internalMessageAvatarData.removeValue(forKey: messageUser.userId)
                internalMessageAvatarAttachmentIDs.removeValue(forKey: messageUser.userId)
                continue
            }
            if internalMessageAvatarAttachmentIDs[messageUser.userId] == attachmentId,
               internalMessageAvatarData[messageUser.userId] != nil {
                continue
            }
            guard let data = try? await api.downloadAttachment(attachmentId, module: "profile-avatar") else {
                continue
            }
            internalMessageAvatarData[messageUser.userId] = data
            internalMessageAvatarAttachmentIDs[messageUser.userId] = attachmentId
            if messageUser.userId == user?.userId {
                profileAvatarData = data
                if let identifier = profileStoreIdentifier {
                    try? ProfilePresentationStore.save(
                        identifier: identifier,
                        displayName: displayedProfileName,
                        avatarData: data
                    )
                }
            }
        }
    }

    func applicationDidBecomeActive() async {
        await checkAppVersion()
        let recoveryPreviewEnabled = ProcessInfo.processInfo.arguments.contains("-preview-enable-recovery")
        if (!isDesignPreview || recoveryPreviewEnabled), !recorder.isRecording {
            do {
                let recovered = try await PersistentQueues.shared.recoverInterruptedRecordings()
                await recorder.refreshPendingCount()
                if recovered > 0 {
                    successMessage = "已恢复 \(recovered) 段异常退出前保存的会议语音，等待补传"
                }
            } catch {
                errorMessage = "异常退出录音恢复失败：\(error.localizedDescription)"
            }
        }
        guard isAuthenticated else { return }
        await refreshBusinessData(showCompletion: false)
        startAutomaticBusinessRefresh()
    }

    @discardableResult
    func refreshBusinessData(showCompletion: Bool = true) async -> Bool {
        guard !isRefreshingBusinessData else { return false }
        isRefreshingBusinessData = true
        businessRefreshStatus = "正在更新客户、拜访、日报和待补传资料"
        defer { isRefreshingBusinessData = false }

        if isDesignPreview {
            await recorder.refreshPendingCount()
            lastBusinessRefreshAt = Date()
            businessRefreshStatus = "地区样例数据和本机补传队列已检查"
            if showCompletion { successMessage = "业务数据更新完成" }
            return true
        }

        var issues: [String] = []
        do {
            let date = APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier)
            dashboard = try await api.dashboard(date: date)
        } catch {
            issues.append("拜访与打卡资料更新失败：\(error.localizedDescription)")
        }
        do {
            customers = scopedCustomers(try await api.customers())
        } catch {
            issues.append("客户资料更新失败：\(error.localizedDescription)")
        }
        lastBusinessRefreshAt = Date()

        if issues.isEmpty {
            businessRefreshStatus = "QUaD 客户、拜访、打卡与定位资料已更新"
            if showCompletion { successMessage = "业务数据更新完成" }
            return true
        }
        let summary = issues.joined(separator: "；")
        businessRefreshStatus = "部分资料已更新：\(summary)"
        if showCompletion { errorMessage = summary }
        return false
    }

    /// The employee-facing home screen intentionally exposes one update action.
    /// It refreshes all currently supported business data, replays offline
    /// queues, and then checks the official App version policy.
    func updateWholeSystem() async {
        guard !isRefreshingBusinessData, !appVersionState.isChecking else { return }
        successMessage = ""
        errorMessage = ""

        let businessUpdated = await refreshBusinessData(showCompletion: false)
        await checkAppVersion()

        guard businessUpdated else {
            errorMessage = businessRefreshStatus
            return
        }
        switch appVersionState {
        case .optionalUpdate(let policy), .requiredUpdate(let policy):
            successMessage = "系统资料已更新，发现 App 新版本 \(policy.latestVersion)"
        case .current:
            successMessage = "整个系统已更新，当前 App 已是最新版本"
        case .notConfigured:
            successMessage = "整个系统资料已更新"
        case .checking:
            successMessage = "整个系统资料已更新"
        }
    }

    func checkAppVersion() async {
        if isDesignPreview {
            appVersionState = .current
            return
        }
        appVersionState = .checking
        do {
            let policy = try await api.versionPolicy(currentVersion: currentAppVersion)
            if Self.compareVersions(currentAppVersion, policy.minimumVersion) == .orderedAscending {
                appVersionState = .requiredUpdate(policy)
            } else if Self.compareVersions(currentAppVersion, policy.latestVersion) == .orderedAscending {
                appVersionState = .optionalUpdate(policy)
            } else {
                appVersionState = .current
            }
        } catch {
            appVersionState = .notConfigured
        }
    }

    func sendInternalMessage(
        recipientId: String,
        subject: String,
        text: String,
        media: ChatMediaDraft? = nil
    ) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !recipientId.isEmpty else {
            errorMessage = "请选择站内信息接收人"
            return false
        }
        guard !trimmed.isEmpty || media != nil else {
            errorMessage = "请输入消息，或选择语音、图片和文件"
            return false
        }
        if let media, media.data.count > 5 * 1024 * 1024 {
            errorMessage = "站内附件不能超过 5 MB"
            return false
        }
        let content = trimmed.isEmpty
            ? "[\(media?.kind.label ?? "附件")] \(media?.fileName ?? "")"
            : trimmed

        if isDesignPreview {
            let attachment = media.map {
                InternalMessageAttachment(
                    attachmentId: "preview-attachment-\(UUID().uuidString)",
                    fileName: $0.fileName,
                    contentType: $0.contentType,
                    sizeBytes: $0.data.count
                )
            }
            internalMessages.append(
                InternalMessage(
                    messageId: "preview-message-\(UUID().uuidString)",
                    senderId: user?.userId ?? "preview-user",
                    recipientId: recipientId,
                    subject: subject,
                    content: content,
                    status: "UNREAD",
                    sentAt: ISO8601DateFormatter().string(from: Date()),
                    readAt: nil,
                    senderName: displayedProfileName,
                    recipientName: internalMessageUsers.first(where: { $0.userId == recipientId })?.resolvedName,
                    viewerStatus: nil,
                    received: 0,
                    attachments: attachment.map { [$0] } ?? []
                )
            )
            return true
        }

        var saved = false
        await perform {
            let response = try await api.sendInternalMessage(
                recipientId: recipientId,
                subject: subject,
                content: content
            )
            if let media {
                let uploaded = try await api.uploadAttachment(
                    objectId: response.messageId,
                    fileName: media.fileName,
                    contentType: media.contentType,
                    data: media.data,
                    module: "collaboration"
                )
                let listed = try await api.attachments(objectId: response.messageId, module: "collaboration")
                guard listed.items.contains(where: { $0.attachmentId == uploaded.attachmentId && $0.sizeBytes == media.data.count }) else {
                    throw APIError.message("消息文字已发送，但服务器尚未确认完整附件")
                }
            }
            let overview = try await api.collaborationOverview()
            await applyInternalMessageOverview(overview)
            saved = true
        }
        return saved
    }

    @discardableResult
    func queueChatMessage(
        recipientId: String,
        subject: String,
        text: String,
        media: ChatMediaDraft? = nil
    ) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !recipientId.isEmpty else {
            errorMessage = "请选择站内信息接收人"
            return false
        }
        guard !trimmed.isEmpty || media != nil else {
            errorMessage = "请输入消息，或选择语音、图片和文件"
            return false
        }
        guard media?.data.count ?? 0 <= 5 * 1024 * 1024 else {
            errorMessage = "站内附件不能超过 5 MB"
            return false
        }
        guard !appVersionState.blocksWrites else {
            errorMessage = "当前版本低于企业允许的最低版本。请先更新 App。"
            return false
        }

        let content = trimmed.isEmpty
            ? "[\(media?.kind.label ?? "附件")] \(media?.fileName ?? "")"
            : trimmed
        let id = UUID().uuidString
        let pending = PendingInternalMessage(
            id: id,
            recipientId: recipientId,
            subject: subject,
            content: content,
            media: media,
            queuedAt: Date(),
            status: .sending
        )
        pendingInternalMessages.append(pending)
        errorMessage = ""

        if isDesignPreview {
            completePreviewChatMessage(pending)
        } else {
            startPendingInternalMessageDelivery(id: id)
        }
        return true
    }

    func retryPendingInternalMessage(_ id: String) {
        guard let index = pendingInternalMessages.firstIndex(where: { $0.id == id }) else { return }
        guard case .failed = pendingInternalMessages[index].status else { return }
        pendingInternalMessages[index].status = .sending
        errorMessage = ""
        startPendingInternalMessageDelivery(id: id)
    }

    private func startPendingInternalMessageDelivery(id: String) {
        guard internalMessageDeliveryTasks[id] == nil else { return }
        internalMessageDeliveryTasks[id] = Task { [weak self] in
            await self?.deliverPendingInternalMessage(id: id)
        }
    }

    private func deliverPendingInternalMessage(id: String) async {
        defer { internalMessageDeliveryTasks[id] = nil }
        guard let pending = pendingInternalMessages.first(where: { $0.id == id }) else { return }
        do {
            let response = try await api.sendInternalMessage(
                recipientId: pending.recipientId,
                subject: pending.subject,
                content: pending.content,
                clientMessageId: pending.id
            )
            if let media = pending.media {
                var listed = try await api.attachments(
                    objectId: response.messageId,
                    module: "collaboration"
                )
                if !listed.items.contains(where: {
                    $0.fileName == media.fileName && $0.sizeBytes == media.data.count
                }) {
                    let uploaded = try await api.uploadAttachment(
                        objectId: response.messageId,
                        fileName: media.fileName,
                        contentType: media.contentType,
                        data: media.data,
                        module: "collaboration"
                    )
                    listed = try await api.attachments(
                        objectId: response.messageId,
                        module: "collaboration"
                    )
                    guard listed.items.contains(where: {
                        $0.attachmentId == uploaded.attachmentId
                            && $0.sizeBytes == media.data.count
                    }) else {
                        throw APIError.message("消息已发送，但附件尚未完整上传")
                    }
                }
            }
            let overview = try await api.collaborationOverview()
            await applyInternalMessageOverview(overview)
            pendingInternalMessages.removeAll { $0.id == id }
        } catch {
            guard let index = pendingInternalMessages.firstIndex(where: { $0.id == id }) else { return }
            let reason = error.localizedDescription
            pendingInternalMessages[index].status = .failed(reason)
            errorMessage = "消息发送失败，内容已保留；点击红色状态即可重试"
        }
    }

    private func completePreviewChatMessage(_ pending: PendingInternalMessage) {
        let attachment = pending.media.map {
            InternalMessageAttachment(
                attachmentId: "preview-attachment-\(pending.id)",
                fileName: $0.fileName,
                contentType: $0.contentType,
                sizeBytes: $0.data.count
            )
        }
        internalMessages.append(
            InternalMessage(
                messageId: pending.id,
                senderId: user?.userId ?? "preview-user",
                recipientId: pending.recipientId,
                subject: pending.subject,
                content: pending.content,
                status: "UNREAD",
                sentAt: pending.queuedAt.ISO8601Format(),
                readAt: nil,
                senderName: displayedProfileName,
                recipientName: internalMessageUsers.first(where: { $0.userId == pending.recipientId })?.resolvedName,
                viewerStatus: nil,
                received: 0,
                attachments: attachment.map { [$0] } ?? []
            )
        )
        pendingInternalMessages.removeAll { $0.id == pending.id }
    }

    func downloadInternalMessageAttachment(_ attachment: InternalMessageAttachment) async -> URL? {
        guard !isDesignPreview else {
            errorMessage = "设计预览不包含真实附件，请登录后打开服务器中的文件"
            return nil
        }
        do {
            let data = try await api.downloadAttachment(attachment.attachmentId, module: "collaboration")
            let safeName = attachment.fileName
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: ":", with: "_")
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("LidaField-MessageAttachments", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("\(attachment.attachmentId)-\(safeName)")
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            errorMessage = "附件打开失败：\(error.localizedDescription)"
            return nil
        }
    }

    func markConversationRead(recipientId: String) async {
        let currentUserId = user?.userId ?? ""
        let unread = internalMessages.filter {
            $0.senderId == recipientId && $0.recipientId == currentUserId && $0.viewerStatus == "UNREAD"
        }
        if isDesignPreview { return }
        for message in unread {
            _ = try? await api.markInternalMessageRead(message.messageId)
        }
        if !unread.isEmpty { await loadInternalMessages() }
    }

    func submitLeaveRequest(
        approverId: String,
        leaveType: String,
        startDate: Date,
        endDate: Date,
        reason: String,
        handover: String
    ) async -> Bool {
        guard endDate >= startDate else {
            errorMessage = "请假结束时间不能早于开始时间"
            return false
        }
        let body = """
        申请人：\(user?.displayName ?? user?.loginName ?? "当前员工")
        请假类型：\(leaveType)
        开始时间：\(region.formatDate(startDate))
        结束时间：\(region.formatDate(endDate))
        请假原因：\(reason)
        工作交接：\(handover.isEmpty ? "无" : handover)
        """
        let sent = await sendInternalMessage(
            recipientId: approverId,
            subject: "请假申请 · \(leaveType)",
            text: body
        )
        if sent { successMessage = "请假申请已作为站内消息发送给审批人" }
        return sent
    }

    func submitExpenseClaim(
        department: String,
        category: String,
        amount: Double,
        expenseDate: Date,
        vendorName: String,
        invoiceNumber: String,
        city: String,
        receiptReference: String,
        description: String
    ) async -> Bool {
        guard amount > 0 else {
            errorMessage = "请输入正确的报销金额"
            return false
        }
        if isDesignPreview {
            successMessage = "报销申请已提交，等待审批"
            return true
        }
        var saved = false
        await perform {
            let created = try await api.createExpenseClaim(
                employeeName: user?.displayName ?? user?.loginName ?? "当前员工",
                department: department,
                category: category,
                amount: amount,
                currency: region.currencyCode,
                expenseDate: APIClient.localDate(expenseDate, timeZoneIdentifier: region.timeZoneIdentifier),
                vendorName: vendorName,
                invoiceNumber: invoiceNumber,
                city: city,
                receiptReference: receiptReference,
                description: description
            )
            let submitted = try await api.submitExpenseClaim(created.claimId)
            successMessage = "报销单 \(created.claimCode) 已提交，状态：\(submitted.status)"
            saved = true
        }
        return saved
    }

    var currentAppVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    private func startAutomaticBusinessRefresh() {
        guard isAuthenticated, automaticRefreshTask == nil else { return }
        automaticRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(120))
                guard !Task.isCancelled else { return }
                await self?.refreshBusinessData(showCompletion: false)
            }
        }
    }

    private func stopAutomaticBusinessRefresh() {
        automaticRefreshTask?.cancel()
        automaticRefreshTask = nil
    }

    private static func compareVersions(_ lhs: String, _ rhs: String) -> ComparisonResult {
        let left = lhs.split(separator: ".").map { Int($0) ?? 0 }
        let right = rhs.split(separator: ".").map { Int($0) ?? 0 }
        for index in 0..<max(left.count, right.count) {
            let l = index < left.count ? left[index] : 0
            let r = index < right.count ? right[index] : 0
            if l < r { return .orderedAscending }
            if l > r { return .orderedDescending }
        }
        return .orderedSame
    }

    func createCustomer(_ draft: CustomerDraft) async -> Bool {
        guard !draft.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !draft.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "请填写公司名称和省市区街道门牌号"
            return false
        }
        if isDesignPreview {
            successMessage = "客户资料已通过校验"
            return true
        }
        var saved = false
        await perform {
            let customer = try await api.createCustomer(draft)
            if let identifier = user?.userId {
                OwnedCustomerStore.record(customer.customerId, identifier: identifier)
            }
            customers.insert(customer, at: 0)
            successMessage = "客户资料已保存"
            saved = true
        }
        return saved
    }

    private func scopedCustomers(_ source: [CustomerSummary]) -> [CustomerSummary] {
        source
    }

    private func emptyDashboard(workDate: String? = nil) -> FieldDashboard {
        FieldDashboard(
            workDate: workDate ?? APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier),
            trackingIntervalSeconds: 300,
            activeShift: nil,
            shifts: [],
            todayCustomers: [],
            route: []
        )
    }

    func confirmVisitPlans(schedules: [VisitScheduleDraft]) async -> Bool {
        guard !schedules.isEmpty else { errorMessage = "请至少选择一位客户"; return false }
        guard !isSavingVisitPlans else { return false }
        let ordered = schedules.sorted {
            if $0.scheduledAt != $1.scheduledAt { return $0.scheduledAt < $1.scheduledAt }
            return $0.sequence < $1.sequence
        }
        if isDesignPreview {
            for schedule in ordered {
                let plan = VisitPlan(
                    planId: "preview-plan-\(schedule.id)-\(UUID().uuidString.prefix(6))",
                    planCode: nil,
                    customerId: schedule.customer.customerId,
                    customerName: schedule.customer.customerName,
                    contactName: schedule.customer.contactName,
                    phone: schedule.customer.phone,
                    scheduledAt: regionalTimestamp(schedule.scheduledAt),
                    address: schedule.customer.address,
                    latitude: nil,
                    longitude: nil,
                    objective: "外勤拜访",
                    routeSequence: Double(schedule.sequence),
                    status: "PLANNED",
                    cancellationReason: nil
                )
                mergeNewlyCreatedVisitPlan(plan, persist: false)
                selectedCustomerIDs.remove(schedule.customer.id)
            }
            successMessage = "已保存 \(ordered.count) 项独立拜访时间"
            return true
        }
        guard !appVersionState.blocksWrites else {
            errorMessage = "当前版本低于企业允许的最低版本。请先更新 App 后再保存拜访计划。"
            return false
        }
        guard let identifier = profileStoreIdentifier else {
            errorMessage = "登录资料尚未准备完成，请重新进入后再保存"
            return false
        }

        // Commit to the phone before waiting for the network. The user sees
        // today's plans immediately and a transient connection cannot leave
        // the button spinning with no saved result.
        isSavingVisitPlans = true
        defer { isSavingVisitPlans = false }
        errorMessage = ""
        successMessage = ""
        let localPlans = ordered.map(localVisitPlan(for:))
        guard PendingVisitPlanStore.upsert(localPlans, identifier: identifier) else {
            errorMessage = "手机本地未能保存拜访计划，请保留当前页面后重试"
            return false
        }
        for plan in localPlans {
            mergeNewlyCreatedVisitPlan(plan, persist: false)
        }
        // The selection page is a staging queue, not permanent history.
        // Once an arrangement is safely stored on the phone, move it out of
        // that queue; the dated visit remains available in Today/Visit History.
        for schedule in ordered {
            selectedCustomerIDs.remove(schedule.customer.id)
        }

        let todayKey = APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier)
        let todayCount = ordered.filter {
            APIClient.localDate($0.scheduledAt, timeZoneIdentifier: region.timeZoneIdentifier) == todayKey
        }.count
        successMessage = todayCount > 0
            ? "已保存到手机；今天的 \(todayCount) 项已进入今日拜访，正在同步总系统"
            : "已保存到手机；到安排日期会自动出现，正在同步总系统"

        Task { [weak self] in
            guard let self else { return }
            let issues = await self.flushVisitPlanQueue()
            if let issue = issues.first {
                self.errorMessage = "计划已保存在手机，\(issue)；系统会自动重试"
            } else {
                self.successMessage = "拜访计划已保存并同步到总系统"
            }
        }
        return true
    }

    func deleteVisitPlan(_ plan: VisitPlan) async -> Bool {
        guard !deletingVisitPlanIDs.contains(plan.planId) else { return false }
        guard ["PLANNED", "PENDING", "SCHEDULED"].contains(plan.status.uppercased()) else {
            errorMessage = "只有尚未拜访的计划可以取消；已有业务过程或凭证必须保留"
            return false
        }
        guard !appVersionState.blocksWrites else {
            errorMessage = "当前版本低于企业允许的最低版本，请更新 App 后再取消拜访计划"
            return false
        }

        deletingVisitPlanIDs.insert(plan.planId)
        errorMessage = ""
        successMessage = ""
        defer { deletingVisitPlanIDs.remove(plan.planId) }

        do {
            if plan.planId.hasPrefix("local-") {
                guard let identifier = profileStoreIdentifier else {
                    throw APIError.message("登录资料尚未准备完成，请重新进入后再取消")
                }
                PendingVisitPlanStore.remove(plan.planId, identifier: identifier)
            } else if !isDesignPreview {
                _ = try await api.deleteVisitPlan(plan.planId)
            }
            removeVisitPlanFromDashboard(plan)
            successMessage = "已取消拜访计划：\(plan.customerName)；客户资料仍保留"
            return true
        } catch {
            errorMessage = "取消拜访计划失败：\(error.localizedDescription)"
            return false
        }
    }

    private func removeVisitPlanFromDashboard(_ plan: VisitPlan) {
        if let identifier = profileStoreIdentifier {
            PendingVisitPlanStore.remove(plan.planId, identifier: identifier)
        }
        if let customerId = plan.customerId {
            selectedCustomerIDs.remove(customerId)
        }
        if selectedVisit?.planId == plan.planId { selectedVisit = nil }
        guard let current = dashboard else { return }
        dashboard = FieldDashboard(
            workDate: current.workDate,
            trackingIntervalSeconds: current.trackingIntervalSeconds,
            activeShift: current.activeShift,
            shifts: current.shifts,
            todayCustomers: current.todayCustomers.filter { $0.planId != plan.planId },
            route: current.route
        )
    }

    private func localVisitPlan(for schedule: VisitScheduleDraft) -> VisitPlan {
        let localID = UUID().uuidString
        let scheduledAt = regionalTimestamp(schedule.scheduledAt)
        let datePart = APIClient.localDate(
            schedule.scheduledAt,
            timeZoneIdentifier: region.timeZoneIdentifier
        ).replacingOccurrences(of: "-", with: "")
        let fingerprint = "\(schedule.customer.customerId)|\(scheduledAt)|外勤拜访"
        let stableSuffix = stableVisitPlanSuffix(fingerprint)
        return VisitPlan(
            planId: "local-\(localID)",
            planCode: "MPLAN-\(datePart)-\(stableSuffix)",
            customerId: schedule.customer.customerId,
            customerName: schedule.customer.customerName,
            contactName: schedule.customer.contactName,
            phone: schedule.customer.phone,
            scheduledAt: scheduledAt,
            address: schedule.customer.address,
            latitude: nil,
            longitude: nil,
            objective: "外勤拜访",
            routeSequence: Double(schedule.sequence),
            status: "PLANNED",
            cancellationReason: nil
        )
    }

    private func stableVisitPlanSuffix(_ value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return String(format: "%016llX", hash)
    }

    func startTrip(_ plan: VisitPlan) async -> Bool {
        if appVersionState.blocksWrites {
            errorMessage = "当前版本低于企业允许的最低版本，请更新 App 后再出发"
            return false
        }
        if isDesignPreview {
            let updated = VisitPlan(
                planId: plan.planId,
                planCode: plan.planCode,
                customerId: plan.customerId,
                customerName: plan.customerName,
                contactName: plan.contactName,
                phone: plan.phone,
                scheduledAt: plan.scheduledAt,
                address: plan.address,
                latitude: plan.latitude,
                longitude: plan.longitude,
                objective: plan.objective,
                routeSequence: plan.routeSequence,
                status: "TRAVELING",
                cancellationReason: plan.cancellationReason
            )
            mergeNewlyCreatedVisitPlan(updated, persist: false)
            selectedVisit = updated
            successMessage = "出发位置已保存，行程已开始"
            return true
        }
        isBusy = true
        errorMessage = ""
        successMessage = ""
        activeTripConflict = nil
        defer { isBusy = false }
        do {
            let current = try await location.currentSystemLocation(for: .visitArrival)
            let address = await location.humanReadableAddress(for: current)
            let updated = try await api.startTrip(
                for: plan,
                location: CLLocationPayload(
                    latitude: current.coordinate.latitude,
                    longitude: current.coordinate.longitude,
                    accuracy: current.horizontalAccuracy,
                    address: address
                )
            )
            mergeNewlyCreatedVisitPlan(updated, persist: false)
            selectedVisit = updated
            successMessage = "已记录出发位置，正在前往 \(plan.customerName)"
            return true
        } catch APIError.activeTrip(let trip) {
            activeTripConflict = trip
            errorMessage = ""
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func abandonActiveTrip(reason: String) async -> Bool {
        guard let trip = activeTripConflict else { return false }
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanReason.isEmpty else {
            errorMessage = "请填写放弃旧行程的原因"
            return false
        }
        isBusy = true
        errorMessage = ""
        defer { isBusy = false }
        do {
            try await api.cancelTrip(trip.id, reason: cleanReason)
            activeTripConflict = nil
            selectedVisit = nil
            _ = await refreshBusinessData(showCompletion: false)
            successMessage = "已放弃前往 \(trip.businessName) 的旧行程，原拜访计划已恢复为待出发"
            return true
        } catch {
            errorMessage = "放弃旧行程失败：\(error.localizedDescription)"
            return false
        }
    }

    func arriveAtCustomer(_ plan: VisitPlan, evidence: CapturedPhotoEvidence) async -> Bool {
        if appVersionState.blocksWrites {
            errorMessage = "当前版本低于企业允许的最低版本，请更新 App 后再到店打卡"
            return false
        }
        if isDesignPreview {
            markArtifactComplete(planId: plan.planId, kind: "arrival")
            successMessage = "到店手机定位已保存"
            return true
        }
        var saved = false
        await perform {
            let current = CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: evidence.latitude, longitude: evidence.longitude),
                altitude: 0,
                horizontalAccuracy: evidence.accuracyM,
                verticalAccuracy: -1,
                timestamp: evidence.capturedAt
            )
            if let latitude = plan.latitude, let longitude = plan.longitude {
                let customerLocation = CLLocation(latitude: latitude, longitude: longitude)
                if let issue = PhotoCapturePolicy.locationIssue(current, customerLocation: customerLocation) {
                    throw APIError.message(issue)
                }
            } else if let issue = PhotoCapturePolicy.locationIssue(current) {
                throw APIError.message(issue)
            }
            let uploaded = try await api.uploadAttachment(
                objectId: plan.planId,
                fileName: "外勤-到店门头-\(evidence.id.uuidString).jpg",
                contentType: "image/jpeg",
                data: evidence.data
            )
            guard let photoURL = uploaded.url, photoURL.contains("/customer-media/") else {
                throw APIError.message("服务器没有返回可核验的到店照片地址")
            }
            let updated = try await api.startVisit(
                for: plan,
                photoURL: photoURL,
                location: CLLocationPayload(
                    latitude: evidence.latitude,
                    longitude: evidence.longitude,
                    accuracy: evidence.accuracyM,
                    address: evidence.address
                )
            )
            markArtifactComplete(planId: plan.planId, kind: "arrival")
            markArtifactComplete(planId: plan.planId, kind: "photos")
            mergeNewlyCreatedVisitPlan(updated, persist: false)
            selectedVisit = updated
            let actualPlace = evidence.address?.isEmpty == false ? evidence.address! : evidence.coordinateText
            successMessage = localized(
                cn: "到店打卡已保存：\(actualPlace)（精度约 ±\(Int(current.horizontalAccuracy)) 米）",
                us: "Arrival check-in saved: \(actualPlace) (accuracy about ±\(Int(current.horizontalAccuracy)) m)"
            )
            saved = true
        }
        return saved
    }

    func saveArtifact(
        kind: String,
        values: [String: String],
        products: [VisitProductLine] = [],
        plan explicitPlan: VisitPlan? = nil
    ) async -> Bool {
        let plan = explicitPlan ?? selectedPlan
        if isDesignPreview {
            if kind == "meeting" { completedMeetingPlanIDs.insert(plan.planId) }
            else { markArtifactComplete(planId: plan.planId, kind: kind) }
            successMessage = "本页资料已保存"
            return true
        }
        var saved = false
        await perform {
            let artifact = VisitArtifact(
                kind: kind,
                customerName: plan.customerName,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                values: values,
                products: products
            )
            let data = try JSONEncoder().encode(artifact)
            let uploaded = try await api.uploadAttachment(
                objectId: plan.planId,
                fileName: "外勤-\(kind)-\(Date().ISO8601Format()).json",
                contentType: "application/json",
                data: data
            )
            let listed = try await api.attachments(objectId: plan.planId)
            guard listed.items.contains(where: { $0.attachmentId == uploaded.attachmentId && $0.sizeBytes == data.count }) else {
                throw APIError.message("服务器未确认完整业务资料")
            }
            if kind == "meeting" { completedMeetingPlanIDs.insert(plan.planId) }
            else { markArtifactComplete(planId: plan.planId, kind: kind) }
            successMessage = "资料已保存并由服务器确认"
            saved = true
        }
        return saved
    }

    func uploadPhoto(evidence: CapturedPhotoEvidence, category: String, plan: VisitPlan) async -> Bool {
        guard evidence.accuracyM >= 0, evidence.accuracyM <= PhotoCapturePolicy.maximumAccuracyM else {
            errorMessage = "照片缺少合格定位，请在客户现场重新拍摄"
            return false
        }
        if isDesignPreview {
            markArtifactComplete(planId: plan.planId, kind: "photos")
            successMessage = "现场照片与手机定位凭证已加入对应分类"
            return true
        }
        guard !appVersionState.blocksWrites else {
            errorMessage = "当前版本低于企业允许的最低版本，请更新 App 后再上传现场照片"
            return false
        }
        errorMessage = ""
        do {
            try await uploadPhotoEvidence(
                evidence,
                objectId: plan.planId,
                customerName: plan.customerName,
                category: category
            )
            markArtifactComplete(planId: plan.planId, kind: "photos")
            successMessage = "照片与手机定位凭证已上传并由服务器确认"
            return true
        } catch {
            errorMessage = "照片自动上传失败：\(error.localizedDescription)"
            return false
        }
    }

    private func uploadPhotoEvidence(
        _ evidence: CapturedPhotoEvidence,
        objectId: String,
        customerName: String,
        category: String
    ) async throws {
        let imageFileName = "外勤-\(category)-\(evidence.id.uuidString).jpg"
        let manifestFileName = "外勤-\(category)-\(evidence.id.uuidString)-定位凭证.json"
        let manifest = PhotoEvidenceManifest(
            evidenceId: evidence.id,
            source: "camera",
            category: category,
            customerName: customerName,
            capturedAt: ISO8601DateFormatter().string(from: evidence.capturedAt),
            latitude: evidence.latitude,
            longitude: evidence.longitude,
            accuracyM: evidence.accuracyM,
            address: evidence.address,
            positioningMethod: "IOS_CORE_LOCATION_FUSED",
            distanceToCustomerM: evidence.distanceToCustomerM,
            imageFileName: imageFileName
        )
        let manifestData = try JSONEncoder().encode(manifest)
        let imageUpload = try await api.uploadAttachment(
            objectId: objectId,
            fileName: imageFileName,
            contentType: "image/jpeg",
            data: evidence.data
        )
        let manifestUpload = try await api.uploadAttachment(
            objectId: objectId,
            fileName: manifestFileName,
            contentType: "application/json",
            data: manifestData
        )
        let listed = try await api.attachments(objectId: objectId)
        let imageConfirmed = listed.items.contains {
            $0.attachmentId == imageUpload.attachmentId && $0.sizeBytes == evidence.data.count
        }
        let manifestConfirmed = listed.items.contains {
            $0.attachmentId == manifestUpload.attachmentId && $0.sizeBytes == manifestData.count
        }
        guard imageConfirmed && manifestConfirmed else {
            throw APIError.message("服务器未同时确认照片与手机定位凭证")
        }
    }

    func submitDailyReport(notes: String) async -> Bool {
        if isDesignPreview {
            successMessage = "今日工作日报已提交主管"
            return true
        }
        var saved = false
        await perform {
            try await api.submitDailyReport(
                notes: notes,
                date: APIClient.localDate(timeZoneIdentifier: region.timeZoneIdentifier)
            )
            successMessage = "今日工作日报已提交主管"
            saved = true
        }
        return saved
    }

    func completeVisit(endDay: Bool, summary: String) async -> Bool {
        if isDesignPreview {
            successMessage = endDay ? "拜访已完成，今日行程已结束" : "拜访已完成，准备前往下一家"
            return true
        }
        var saved = false
        await perform {
            let updated = try await api.completeVisit(selectedPlan, reportText: summary)
            mergeNewlyCreatedVisitPlan(updated, persist: false)
            selectedVisit = updated
            successMessage = endDay ? "拜访已完成，今日行程已结束" : "拜访已完成，准备前往下一家"
            saved = true
        }
        return saved
    }

    func clockIn() async {
        guard dashboard?.activeShift == nil else {
            attendanceActionStatus = "当前已经上班，下班按钮已启用"
            return
        }
        if isDesignPreview {
            let shift = Shift(
                shiftId: "shift-preview-\(UUID().uuidString)",
                status: "ACTIVE",
                clockInServerAt: ISO8601DateFormatter().string(from: Date()),
                clockInAddress: "模拟器当前位置"
            )
            replaceActiveShift(with: shift)
            location.start(shiftId: shift.shiftId)
            attendanceActionStatus = "上班打卡成功，下班按钮已启用"
            return
        }
        if appVersionState.blocksWrites {
            errorMessage = "当前版本低于企业允许的最低版本，请更新 App 后再上班打卡"
            return
        }
        guard !isAttendanceBusy else { return }
        isAttendanceBusy = true
        errorMessage = ""
        successMessage = ""
        attendanceActionStatus = "正在获取手机综合定位…"
        defer {
            isAttendanceBusy = false
        }
        do {
            let current = try await location.currentSystemLocation(for: .attendance)
            let address = await location.humanReadableAddress(for: current)
            attendanceActionStatus = "正在提交上班打卡…"
            let shift = try await api.startShift(
                latitude: current.coordinate.latitude,
                longitude: current.coordinate.longitude,
                accuracy: current.horizontalAccuracy,
                address: address
            )
            replaceActiveShift(with: shift)
            location.start(shiftId: shift.shiftId)
            attendanceActionStatus = "上班打卡成功，下班按钮已启用"
        } catch {
            if let apiError = error as? APIError, apiError.isActiveShiftConflict {
                try? await refreshDashboard()
                if dashboard?.activeShift != nil {
                    attendanceActionStatus = "已恢复上班状态，下班按钮已启用"
                    errorMessage = ""
                    return
                }
            }
            attendanceActionStatus = "上班打卡未成功，可以重新点击尝试"
            errorMessage = error.localizedDescription
        }
    }

    func clockOut() async {
        guard let shift = dashboard?.activeShift else {
            attendanceActionStatus = "当前尚未上班，请先点击上班打卡"
            return
        }
        if isDesignPreview {
            let completed = Shift(
                shiftId: shift.shiftId,
                status: "ENDED",
                clockInServerAt: shift.clockInServerAt,
                clockInAddress: shift.clockInAddress
            )
            replaceActiveShift(with: nil, completedShift: completed)
            location.stop()
            attendanceActionStatus = "下班打卡成功，上班按钮已重新启用"
            return
        }
        guard !isAttendanceBusy else { return }
        isAttendanceBusy = true
        errorMessage = ""
        successMessage = ""
        attendanceActionStatus = "正在获取下班打卡位置…"
        defer {
            isAttendanceBusy = false
        }
        do {
            let current = try await location.currentSystemLocation(for: .attendance)
            let address = await location.humanReadableAddress(for: current)
            attendanceActionStatus = "正在提交下班打卡…"
            let payload = CLLocationPayload(
                latitude: current.coordinate.latitude,
                longitude: current.coordinate.longitude,
                accuracy: current.horizontalAccuracy,
                address: address
            )
            let completed = try await api.endShift(shift.shiftId, location: payload)
            replaceActiveShift(with: nil, completedShift: completed)
            location.stop()
            if recorder.isRecording { await recorder.stop() }
            attendanceActionStatus = "下班打卡成功，上班按钮已重新启用"
            Task { [weak self] in await self?.flushQueues() }
        } catch {
            attendanceActionStatus = "下班打卡未成功，仍保持上班定位"
            errorMessage = error.localizedDescription
        }
    }

    private func replaceActiveShift(with activeShift: Shift?, completedShift: Shift? = nil) {
        guard let current = dashboard else { return }
        let changedShiftId = activeShift?.shiftId ?? completedShift?.shiftId
        var shifts = current.shifts.filter { $0.shiftId != changedShiftId }
        if let activeShift { shifts.insert(activeShift, at: 0) }
        if let completedShift { shifts.insert(completedShift, at: 0) }
        dashboard = FieldDashboard(
            workDate: current.workDate,
            trackingIntervalSeconds: current.trackingIntervalSeconds,
            activeShift: activeShift,
            shifts: shifts,
            todayCustomers: current.todayCustomers,
            route: current.route
        )
        guard shouldPersistAttendanceState, let identifier = profileStoreIdentifier else { return }
        if let activeShift {
            AttendanceStateStore.saveClockedIn(activeShift, workDate: current.workDate, identifier: identifier)
        } else if let completedShift {
            AttendanceStateStore.saveClockedOut(completedShift, workDate: current.workDate, identifier: identifier)
        }
    }

    private var shouldPersistAttendanceState: Bool {
        !isDesignPreview || ProcessInfo.processInfo.arguments.contains("-preview-persist-attendance")
    }

    private func reconciledDashboard(_ remote: FieldDashboard) -> FieldDashboard {
        guard shouldPersistAttendanceState, let identifier = profileStoreIdentifier else { return remote }
        let reportedActive = remote.activeShift ?? remote.shifts.first(where: { shift in
            ["ACTIVE", "CLOCKED_IN", "IN_PROGRESS", "OPEN"].contains(shift.status.uppercased())
        })
        let local = AttendanceStateStore.load(identifier: identifier, workDate: remote.workDate)
        var resolvedActive = reportedActive
        var shifts = remote.shifts

        if let local {
            if local.isClockedIn {
                if reportedActive == nil {
                    resolvedActive = local.shift
                    shifts.removeAll { $0.shiftId == local.shift.shiftId }
                    shifts.insert(local.shift, at: 0)
                } else if reportedActive?.shiftId != local.shift.shiftId, let reportedActive {
                    AttendanceStateStore.saveClockedIn(reportedActive, workDate: remote.workDate, identifier: identifier)
                }
            } else if reportedActive == nil || reportedActive?.shiftId == local.shift.shiftId {
                resolvedActive = nil
                shifts.removeAll { $0.shiftId == local.shift.shiftId }
                shifts.insert(local.shift, at: 0)
            } else if let reportedActive {
                AttendanceStateStore.saveClockedIn(reportedActive, workDate: remote.workDate, identifier: identifier)
            }
        } else if let reportedActive {
            AttendanceStateStore.saveClockedIn(reportedActive, workDate: remote.workDate, identifier: identifier)
        }

        let attendanceDashboard = FieldDashboard(
            workDate: remote.workDate,
            trackingIntervalSeconds: remote.trackingIntervalSeconds,
            activeShift: resolvedActive,
            shifts: shifts,
            todayCustomers: remote.todayCustomers,
            route: remote.route
        )
        return reconciledVisitPlans(attendanceDashboard, identifier: identifier)
    }

    private func reconciledVisitPlans(_ remote: FieldDashboard, identifier: String) -> FieldDashboard {
        let remoteIDs = Set(remote.todayCustomers.map(\.planId))
        let remoteCodes = Set(remote.todayCustomers.compactMap(\.planCode))
        var pending = PendingVisitPlanStore.load(identifier: identifier)
        pending.removeAll {
            remoteIDs.contains($0.planId)
                || ($0.planCode.map(remoteCodes.contains) ?? false)
        }
        PendingVisitPlanStore.save(pending, identifier: identifier)

        let localToday = pending.filter { planDateKey($0) == remote.workDate }
        var merged = remote.todayCustomers
        for plan in localToday where !merged.contains(where: { $0.planId == plan.planId }) {
            merged.append(plan)
        }
        merged.sort(by: visitPlanComesBefore)
        return FieldDashboard(
            workDate: remote.workDate,
            trackingIntervalSeconds: remote.trackingIntervalSeconds,
            activeShift: remote.activeShift,
            shifts: remote.shifts,
            todayCustomers: merged,
            route: remote.route
        )
    }

    private func mergeNewlyCreatedVisitPlan(_ plan: VisitPlan, persist: Bool = true) {
        if persist, let identifier = profileStoreIdentifier {
            _ = PendingVisitPlanStore.upsert([plan], identifier: identifier)
        }
        guard let current = dashboard, planDateKey(plan) == current.workDate else { return }
        var merged = current.todayCustomers.filter { $0.planId != plan.planId }
        merged.append(plan)
        merged.sort(by: visitPlanComesBefore)
        dashboard = FieldDashboard(
            workDate: current.workDate,
            trackingIntervalSeconds: current.trackingIntervalSeconds,
            activeShift: current.activeShift,
            shifts: current.shifts,
            todayCustomers: merged,
            route: current.route
        )
    }

    private func planDateKey(_ plan: VisitPlan) -> String? {
        guard let scheduledAt = plan.scheduledAt else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fractional.date(from: scheduledAt) ?? ISO8601DateFormatter().date(from: scheduledAt)
        guard let date else { return String(scheduledAt.prefix(10)) }
        return APIClient.localDate(date, timeZoneIdentifier: region.timeZoneIdentifier)
    }

    private func visitPlanComesBefore(_ lhs: VisitPlan, _ rhs: VisitPlan) -> Bool {
        let leftDate = lhs.scheduledAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        let rightDate = rhs.scheduledAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        if let leftDate, let rightDate, leftDate != rightDate { return leftDate < rightDate }
        if lhs.scheduledAt != rhs.scheduledAt { return (lhs.scheduledAt ?? "") < (rhs.scheduledAt ?? "") }
        return (lhs.routeSequence ?? .greatestFiniteMagnitude) < (rhs.routeSequence ?? .greatestFiniteMagnitude)
    }

    private func regionalTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withColonSeparatorInTimeZone]
        formatter.timeZone = region.timeZone
        return formatter.string(from: date)
    }

    func toggleRecording(for plan: VisitPlan) async {
        if recorder.isRecording {
            await stopRecording(for: plan)
        } else {
            await startRecording(for: plan)
        }
    }

    func startRecording(for plan: VisitPlan) async {
        prepareMeetingDraft(for: plan)
        guard !recorder.isRecording, !recorder.isStarting else {
            if recorder.activePlanId != plan.planId {
                errorMessage = recordingOwnershipMessage(requestedPlan: plan)
            }
            return
        }
        do {
            // This App currently follows one company-wide China policy. Pass
            // Chinese explicitly so account/device metadata cannot select an
            // English recognition model.
            try await recorder.start(
                planId: plan.planId,
                localeIdentifier: "zh-CN",
                existingTranscript: meetingTranscript(for: plan.planId)
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stopRecording(for plan: VisitPlan) async {
        guard recorder.isRecording, recorder.activePlanId == plan.planId else {
            if recorder.activePlanId != nil {
                errorMessage = recordingOwnershipMessage(requestedPlan: plan)
            }
            return
        }
        await recorder.stop(reason: "user-end-button")
        persistMeetingDraft(for: plan.planId)
        let job = enqueueMeetingAnalysis(for: plan)
        successMessage = job == nil
            ? "录音已经自动保存；暂未识别到文字，可继续修订"
            : "录音和文字已经自动保存，正在生成 AI 总结并上传"
        Task { [weak self] in
            guard let self else { return }
            if let job {
                await self.executeMeetingAnalysis(job, showMessages: false)
            }
            await self.flushRecordingQueue()
        }
    }

    func continueRecording(for plan: VisitPlan) async {
        prepareMeetingDraft(for: plan)
        errorMessage = ""
        if let activePlanId = recorder.activePlanId, activePlanId != plan.planId {
            errorMessage = recordingOwnershipMessage(requestedPlan: plan)
            return
        }
        let draft = meetingDrafts[plan.planId] ?? MeetingDraft()
        do {
            if recorder.isRecording {
                try await recorder.continueTranscription(existingTranscript: draft.transcript)
            } else {
                try await recorder.start(
                    planId: plan.planId,
                    localeIdentifier: region.localeIdentifier,
                    existingTranscript: draft.transcript
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func analyzeMeeting(for plan: VisitPlan) async {
        prepareMeetingDraft(for: plan)
        let text = meetingTranscript(for: plan.planId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { errorMessage = "请先填写或生成会议原文"; return }
        guard let job = enqueueMeetingAnalysis(for: plan) else { return }
        await executeMeetingAnalysis(job, showMessages: true)
    }

    private func loadPendingMeetingAnalysisState() {
        guard !isDesignPreview, let identifier = profileStoreIdentifier else { return }
        pendingMeetingAnalysisPlanIDs = Set(
            PendingMeetingAnalysisStore.load(userIdentifier: identifier).map(\.plan.planId)
        )
    }

    private func enqueueMeetingAnalysis(for plan: VisitPlan) -> PendingMeetingAnalysisJob? {
        let text = meetingTranscript(for: plan.planId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let job = PendingMeetingAnalysisJob(plan: plan, transcript: text, enqueuedAt: Date())
        pendingMeetingAnalysisPlanIDs.insert(plan.planId)
        guard !isDesignPreview, let identifier = profileStoreIdentifier else { return job }
        do {
            try PendingMeetingAnalysisStore.upsert(job, userIdentifier: identifier)
        } catch {
            errorMessage = "AI 总结待处理任务保存失败：\(error.localizedDescription)"
        }
        return job
    }

    private func executeMeetingAnalysis(
        _ job: PendingMeetingAnalysisJob,
        showMessages: Bool
    ) async {
        let planId = job.plan.planId
        guard !activeMeetingAnalysisPlanIDs.contains(planId) else { return }
        guard !appVersionState.blocksWrites else { return }
        activeMeetingAnalysisPlanIDs.insert(planId)
        defer { activeMeetingAnalysisPlanIDs.remove(planId) }

        if isDesignPreview {
            var draft = meetingDrafts[planId] ?? MeetingDraft(transcript: job.transcript)
            draft.aiResult = "客户需求：测试 QD15 的隔热效果。\n本次结果：留下两卷样品。\n价格反馈：希望收到价格表。\n下一步：下周回访测试结果。"
            draft.updatedAt = Date()
            meetingDrafts[planId] = draft
            pendingMeetingAnalysisPlanIDs.remove(planId)
            completedMeetingPlanIDs.insert(planId)
            return
        }

        do {
            var draft = meetingDrafts[planId]
                ?? profileStoreIdentifier.flatMap {
                    MeetingDraftStore.load(userIdentifier: $0, planId: planId)
                }
                ?? MeetingDraft(transcript: job.transcript)
            if draft.aiResult.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let result = try await api.organizeVisit(
                    planId: planId,
                    transcript: job.transcript,
                    plan: job.plan
                )
                draft.transcript = result.correctedTranscript ?? draft.transcript
                draft.aiResult = result.organizedChinese
                draft.updatedAt = Date()
                meetingDrafts[planId] = draft
                persistMeetingDraft(for: planId)
            }
            try await uploadAutomaticMeetingArtifact(job: job, draft: draft)
            completedMeetingPlanIDs.insert(planId)
            pendingMeetingAnalysisPlanIDs.remove(planId)
            if let identifier = profileStoreIdentifier {
                try PendingMeetingAnalysisStore.remove(planId: planId, userIdentifier: identifier)
            }
            if showMessages { successMessage = "AI 会议总结已生成并同步到管理中心" }
        } catch {
            pendingMeetingAnalysisPlanIDs.insert(planId)
            if showMessages {
                errorMessage = "AI 总结或管理中心同步暂未完成，已登记为待处理，联网后自动重试：\(error.localizedDescription)"
            }
        }
    }

    private func uploadAutomaticMeetingArtifact(
        job: PendingMeetingAnalysisJob,
        draft: MeetingDraft
    ) async throws {
        let transcript = draft.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let analysis = draft.aiResult.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcript.isEmpty, !analysis.isEmpty else {
            throw APIError.message("会议原文或 AI 总结为空，不能同步到管理中心")
        }
        let artifact = VisitArtifact(
            kind: "meeting",
            customerName: job.plan.customerName,
            createdAt: ISO8601DateFormatter().string(from: job.enqueuedAt),
            values: ["transcript": transcript, "analysis": analysis],
            products: []
        )
        let data = try JSONEncoder().encode(artifact)
        let checksum = data.reduce(UInt64(14_695_981_039_346_656_037)) {
            ($0 ^ UInt64($1)) &* 1_099_511_628_211
        }
        let safePlanId = job.plan.planId.replacingOccurrences(
            of: "[^A-Za-z0-9_-]",
            with: "-",
            options: .regularExpression
        )
        let fileName = "外勤-meeting-auto-\(safePlanId)-\(String(checksum, radix: 16)).json"
        let existing = try await api.attachments(objectId: job.plan.planId)
        if existing.items.contains(where: {
            $0.fileName == fileName && $0.sizeBytes == data.count
        }) {
            return
        }
        let uploaded = try await api.uploadAttachment(
            objectId: job.plan.planId,
            fileName: fileName,
            contentType: "application/json",
            data: data
        )
        let listed = try await api.attachments(objectId: job.plan.planId)
        guard listed.items.contains(where: {
            $0.attachmentId == uploaded.attachmentId && $0.sizeBytes == data.count
        }) else {
            throw APIError.message("服务器未确认 AI 会议总结已同步")
        }
    }

    private func retryPendingMeetingAnalyses() async {
        guard !isDesignPreview,
              isAuthenticated,
              let identifier = profileStoreIdentifier,
              !appVersionState.blocksWrites else { return }
        let jobs = PendingMeetingAnalysisStore.load(userIdentifier: identifier)
            .sorted { $0.enqueuedAt < $1.enqueuedAt }
        pendingMeetingAnalysisPlanIDs.formUnion(jobs.map(\.plan.planId))
        for job in jobs where !activeMeetingAnalysisPlanIDs.contains(job.plan.planId) {
            await executeMeetingAnalysis(job, showMessages: false)
        }
    }

    private func recordingOwnershipMessage(requestedPlan: VisitPlan) -> String {
        guard let activePlanId = recorder.activePlanId else { return "当前没有正在进行的会议录音" }
        let ownerName = activePlans.first(where: { $0.planId == activePlanId })?.customerName ?? "另一位客户"
        return "正在为【\(ownerName)】录音，不能写入【\(requestedPlan.customerName)】。请先返回原客户结束录音。"
    }

    @discardableResult
    func flushQueues() async -> [String] {
        let visitPlanIssues = await flushVisitPlanQueue()
        let locationIssues = await flushLocationQueue()
        let recordingIssues = await flushRecordingQueue()
        return visitPlanIssues + locationIssues + recordingIssues
    }

    @discardableResult
    func flushVisitPlanQueue() async -> [String] {
        guard !isDesignPreview else { return [] }
        guard !isFlushingVisitPlans else { return [] }
        guard let identifier = profileStoreIdentifier else { return ["拜访计划补传等待登录资料"] }
        let pending = PendingVisitPlanStore.load(identifier: identifier)
            .filter { $0.planId.hasPrefix("local-") }
            .sorted(by: visitPlanComesBefore)
        guard !pending.isEmpty else { return [] }

        isFlushingVisitPlans = true
        defer { isFlushingVisitPlans = false }
        var failures = 0
        var firstReason = ""
        var uploaded = 0
        for localPlan in pending {
            do {
                let remotePlan = try await api.createVisitPlan(localPlan)
                PendingVisitPlanStore.remove(localPlan.planId, identifier: identifier)
                mergeNewlyCreatedVisitPlan(remotePlan)
                uploaded += 1
            } catch {
                failures += 1
                if firstReason.isEmpty { firstReason = error.localizedDescription }
            }
        }
        if uploaded > 0 { try? await refreshDashboard() }
        return failures == 0
            ? []
            : ["拜访计划补传失败 \(failures) 项：\(firstReason)"]
    }

    @discardableResult
    func flushLocationQueue() async -> [String] {
        guard !isDesignPreview else { return [] }
        let points = await PersistentQueues.shared.locations().sorted { $0.collectedAt < $1.collectedAt }
        var failures = 0
        var firstReason = ""
        for point in points {
            do {
                _ = try await api.appendLocation(point)
                try await PersistentQueues.shared.removeLocation(point.id)
            } catch {
                failures += 1
                if firstReason.isEmpty { firstReason = error.localizedDescription }
            }
        }
        return failures == 0 ? [] : ["定位补传失败 \(failures) 条：\(firstReason)"]
    }

    @discardableResult
    func flushRecordingQueue() async -> [String] {
        guard !isDesignPreview else { return [] }
        guard !isFlushingRecordings else { return [] }
        isFlushingRecordings = true
        defer { isFlushingRecordings = false }
        let segments = await PersistentQueues.shared.recordings().sorted { $0.createdAt < $1.createdAt }
        var failures = 0
        var firstReason = ""
        for segment in segments {
            let url = await PersistentQueues.shared.recordingURL(name: segment.relativePath)
            guard let data = try? Data(contentsOf: url), !data.isEmpty else {
                let reason = "本机录音文件缺失或无法读取"
                try? await PersistentQueues.shared.markRecordingFailed(segment.id, reason: reason)
                failures += 1
                if firstReason.isEmpty { firstReason = reason }
                continue
            }
            if data.count != segment.byteCount {
                try? await PersistentQueues.shared.reconcileRecordingSize(segment.id, byteCount: data.count)
            }
            do {
                try await api.uploadSegment(segment, data: data)
                try await PersistentQueues.shared.removeRecording(segment.id)
            } catch {
                let reason = error.localizedDescription
                try? await PersistentQueues.shared.markRecordingFailed(segment.id, reason: reason)
                failures += 1
                if firstReason.isEmpty { firstReason = reason }
            }
        }
        await recorder.refreshPendingCount()
        return failures == 0 ? [] : ["录音补传失败 \(failures) 条：\(firstReason)"]
    }

    private func resumeNativeServices() {
        guard !isDesignPreview else { return }
        if let shift = dashboard?.activeShift { location.start(shiftId: shift.shiftId) }
        else { location.stop() }
    }

    private func perform(
        allowDuringRequiredUpdate: Bool = false,
        _ operation: () async throws -> Void
    ) async {
        if appVersionState.blocksWrites && !allowDuringRequiredUpdate {
            errorMessage = "当前版本低于企业允许的最低版本。请先通过正式分发渠道更新 App；查看资料和下班打卡仍可使用。"
            return
        }
        isBusy = true
        errorMessage = ""
        successMessage = ""
        defer { isBusy = false }
        do { try await operation() }
        catch { errorMessage = error.localizedDescription }
    }
}

@MainActor
private enum AttendanceStateStore {
    private struct Snapshot: Codable {
        let workDate: String
        let isClockedIn: Bool
        let shift: Shift
        let updatedAt: Date
    }

    private static let defaults = UserDefaults.standard

    static func load(identifier: String, workDate: String) -> (isClockedIn: Bool, shift: Shift)? {
        guard let data = defaults.data(forKey: key(identifier)),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.workDate == workDate else { return nil }
        return (snapshot.isClockedIn, snapshot.shift)
    }

    static func saveClockedIn(_ shift: Shift, workDate: String, identifier: String) {
        save(Snapshot(workDate: workDate, isClockedIn: true, shift: shift, updatedAt: Date()), identifier: identifier)
    }

    static func saveClockedOut(_ shift: Shift, workDate: String, identifier: String) {
        save(Snapshot(workDate: workDate, isClockedIn: false, shift: shift, updatedAt: Date()), identifier: identifier)
    }

    private static func save(_ snapshot: Snapshot, identifier: String) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key(identifier))
    }

    private static func key(_ identifier: String) -> String {
        let safe = Data(identifier.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
        return "attendance.state.\(safe)"
    }
}

@MainActor
private enum OwnedCustomerStore {
    private static let defaults = UserDefaults.standard

    static func customerIDs(identifier: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key(identifier)) ?? [])
    }

    static func record(_ customerID: String, identifier: String) {
        var identifiers = customerIDs(identifier: identifier)
        identifiers.insert(customerID)
        defaults.set(Array(identifiers).sorted(), forKey: key(identifier))
    }

    private static func key(_ identifier: String) -> String {
        let safe = Data(identifier.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
        return "customers.created-by-user.\(safe)"
    }
}

@MainActor
private enum PendingVisitPlanStore {
    private static let defaults = UserDefaults.standard

    static func load(identifier: String) -> [VisitPlan] {
        guard let data = defaults.data(forKey: key(identifier)) else { return [] }
        return (try? JSONDecoder().decode([VisitPlan].self, from: data)) ?? []
    }

    @discardableResult
    static func save(_ plans: [VisitPlan], identifier: String) -> Bool {
        guard let data = try? JSONEncoder().encode(plans) else { return false }
        defaults.set(data, forKey: key(identifier))
        return load(identifier: identifier).map(\.planId) == plans.map(\.planId)
    }

    @discardableResult
    static func upsert(_ newPlans: [VisitPlan], identifier: String) -> Bool {
        var plans = load(identifier: identifier)
        let newPlanIDs = Set(newPlans.map(\.planId))
        plans.removeAll { newPlanIDs.contains($0.planId) }
        plans.append(contentsOf: newPlans)
        guard save(plans, identifier: identifier) else { return false }
        let storedIDs = Set(load(identifier: identifier).map(\.planId))
        return newPlanIDs.isSubset(of: storedIDs)
    }

    static func remove(_ planID: String, identifier: String) {
        var plans = load(identifier: identifier)
        plans.removeAll { $0.planId == planID }
        _ = save(plans, identifier: identifier)
    }

    private static func key(_ identifier: String) -> String {
        let safe = Data(identifier.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
        return "visit-plans.pending.\(safe)"
    }
}

@MainActor
private enum ProfilePresentationStore {
    private static let defaults = UserDefaults.standard

    static func displayName(identifier: String) -> String? {
        defaults.string(forKey: "profile.displayName.\(safeIdentifier(identifier))")
    }

    static func avatarData(identifier: String) -> Data? {
        try? Data(contentsOf: avatarURL(identifier: identifier))
    }

    static func save(identifier: String, displayName: String, avatarData: Data?) throws {
        let safe = safeIdentifier(identifier)
        defaults.set(displayName, forKey: "profile.displayName.\(safe)")
        let directory = try profileDirectory()
        let url = directory.appendingPathComponent("avatar-\(safe).jpg")
        if let avatarData {
            try avatarData.write(to: url, options: .atomic)
        } else if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    private static func avatarURL(identifier: String) -> URL {
        let base = (try? profileDirectory())
            ?? FileManager.default.temporaryDirectory.appendingPathComponent("LidaFieldProfile", isDirectory: true)
        return base.appendingPathComponent("avatar-\(safeIdentifier(identifier)).jpg")
    }

    private static func profileDirectory() throws -> URL {
        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = applicationSupport
            .appendingPathComponent("LidaField", isDirectory: true)
            .appendingPathComponent("profiles", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private static func safeIdentifier(_ value: String) -> String {
        Data(value.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
    }
}

private enum MeetingDraftStore {
    static func load(userIdentifier: String, planId: String) -> MeetingDraft? {
        guard let data = try? Data(contentsOf: draftURL(userIdentifier: userIdentifier, planId: planId)) else {
            return nil
        }
        return try? JSONDecoder().decode(MeetingDraft.self, from: data)
    }

    static func save(_ draft: MeetingDraft, userIdentifier: String, planId: String) throws {
        let url = try draftURLCreatingDirectory(userIdentifier: userIdentifier, planId: planId)
        let data = try JSONEncoder().encode(draft)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private static func draftURL(userIdentifier: String, planId: String) -> URL {
        let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        return applicationSupport
            .appendingPathComponent("LidaField", isDirectory: true)
            .appendingPathComponent("meeting-drafts", isDirectory: true)
            .appendingPathComponent(safeIdentifier(userIdentifier), isDirectory: true)
            .appendingPathComponent("\(safeIdentifier(planId)).json")
    }

    private static func draftURLCreatingDirectory(userIdentifier: String, planId: String) throws -> URL {
        let url = draftURL(userIdentifier: userIdentifier, planId: planId)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return url
    }

    private static func safeIdentifier(_ value: String) -> String {
        Data(value.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
    }
}

private struct PendingMeetingAnalysisJob: Codable, Equatable {
    let plan: VisitPlan
    let transcript: String
    let enqueuedAt: Date
}

/// Keeps AI-summary work across offline periods, relaunches and later dates.
/// The transcript is business-sensitive, so the queue uses the same protected
/// Application Support policy as meeting drafts rather than UserDefaults.
private enum PendingMeetingAnalysisStore {
    static func load(userIdentifier: String) -> [PendingMeetingAnalysisJob] {
        guard let data = try? Data(contentsOf: queueURL(userIdentifier: userIdentifier)) else {
            return []
        }
        return (try? JSONDecoder().decode([PendingMeetingAnalysisJob].self, from: data)) ?? []
    }

    static func upsert(_ job: PendingMeetingAnalysisJob, userIdentifier: String) throws {
        var jobs = load(userIdentifier: userIdentifier)
        jobs.removeAll { $0.plan.planId == job.plan.planId }
        jobs.append(job)
        try save(jobs, userIdentifier: userIdentifier)
    }

    static func remove(planId: String, userIdentifier: String) throws {
        var jobs = load(userIdentifier: userIdentifier)
        jobs.removeAll { $0.plan.planId == planId }
        try save(jobs, userIdentifier: userIdentifier)
    }

    private static func save(
        _ jobs: [PendingMeetingAnalysisJob],
        userIdentifier: String
    ) throws {
        let url = try queueURLCreatingDirectory(userIdentifier: userIdentifier)
        let data = try JSONEncoder().encode(jobs)
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
    }

    private static func queueURL(userIdentifier: String) -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LidaField", isDirectory: true)
            .appendingPathComponent("meeting-analysis-queue", isDirectory: true)
            .appendingPathComponent("\(safeIdentifier(userIdentifier)).json")
    }

    private static func queueURLCreatingDirectory(userIdentifier: String) throws -> URL {
        let url = queueURL(userIdentifier: userIdentifier)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return url
    }

    private static func safeIdentifier(_ value: String) -> String {
        Data(value.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
    }
}
