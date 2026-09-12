import SwiftUI
import CoreLocation
import UIKit

struct VisitExecutionView: View {
    @EnvironmentObject private var app: AppState
    let plan: VisitPlan
    @State private var showsCustomerDetail = false
    @State private var isArrivalCameraPresented = false
    @State private var arrivalError = ""
    @State private var abandonReason = ""

    private var currentPlan: VisitPlan {
        app.activePlans.first(where: { $0.planId == plan.planId }) ?? plan
    }

    private var customer: CustomerSummary? {
        app.customers.first { $0.customerId == plan.customerId }
    }
    private var hasArrived: Bool {
        app.isArtifactComplete(planId: plan.planId, kind: "arrival") || ["IN_PROGRESS", "COMPLETED"].contains(currentPlan.status)
    }
    private var hasDeparted: Bool { ["TRAVELING", "IN_PROGRESS", "COMPLETED"].contains(currentPlan.status) }

    private var actions: [VisitAction] {
        [
            .init(title: "现场照片", subtitle: "门店、样品和陈列照片", symbol: "photo.on.rectangle.angled", color: .blue),
            .init(title: "沟通记录", subtitle: "语音转文字并由 AI 生成会议纪要", symbol: "waveform", color: .quadPurple),
            .init(title: "样品 / 放货", subtitle: "记录型号、数量和约定价格", symbol: "shippingbox.fill", color: .quadOrange),
            .init(title: "现场订单", subtitle: "直接建立客户销售订单", symbol: "plus", color: .quadTeal),
            .init(title: "客户签收", subtitle: "\(app.region.documentDisplayName)和手写签名", symbol: "signature", color: .quadGreen),
            .init(title: "下次跟进", subtitle: "设置日期、原因和收款提醒", symbol: "calendar.badge.clock", color: .quadRose)
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "本次拜访",
                    title: plan.customerName,
                    subtitle: plan.address ?? "尚未填写地址",
                    badge: hasArrived ? "已到店" : hasDeparted ? "前往中" : "待出发",
                    metrics: [("计划时间", currentPlan.scheduledAt.map(app.region.formatTime) ?? "待安排"), ("顺序", currentPlan.routeSequence.map { String(Int($0)) } ?? "待排"), ("状态", currentPlan.status)]
                )

                HStack(spacing: 11) {
                    Image(systemName: hasArrived ? "checkmark.circle.fill" : "location.circle.fill")
                        .font(.title2).foregroundStyle(hasArrived ? Color.quadGreen : Color.quadOrange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hasArrived ? "到店打卡已完成" : hasDeparted ? "正在前往客户门店" : "请先记录出发位置").font(.headline)
                        Text(hasArrived ? "服务器已记录本次到店状态" : hasDeparted ? "到店后必须现场拍摄门头并核验手机定位" : "点击准备出发，服务器会记录本次行程起点").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if !hasDeparted {
                        Button("准备出发") { Task { _ = await app.startTrip(currentPlan) } }
                            .buttonStyle(.borderedProminent).tint(.quadTeal)
                    } else if !hasArrived {
                        Button("拍门头并到店打卡") { prepareArrivalCamera() }
                            .buttonStyle(.borderedProminent).tint(.quadOrange)
                    }
                }
                .quadCard()

                QuadSectionHeader(title: "本次拜访管理", trailing: "按业务步骤完成")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
                        destination(for: index) {
                            VisitActionTile(action: action, done: isDone(action))
                        }
                        .buttonStyle(.plain)
                        .disabled(!hasArrived)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("拜访资料完成度").font(.headline)
                            Text(hasArrived ? "到店打卡已完成，继续补充本次拜访结果" : "请先完成手机定位到店打卡").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(completionPercent)%").font(.headline).foregroundStyle(Color.quadTeal)
                    }
                    ProgressView(value: Double(completionPercent), total: 100).tint(.quadTeal)
                }
                .quadCard()

                NavigationLink(destination: VisitCompletionView(plan: plan)) {
                    HStack { Text("完成本次拜访"); Spacer(); Image(systemName: "arrow.right") }
                        .font(.headline).foregroundStyle(.white).padding()
                        .background(Color.quadTeal, in: RoundedRectangle(cornerRadius: 13))
                }
                .disabled(!hasArrived)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("拜访执行")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    if customer != nil { showsCustomerDetail = true }
                    else { app.errorMessage = "当前拜访没有关联到可读取的客户资料" }
                } label: {
                    Image(systemName: "person.text.rectangle")
                }
                .accessibilityLabel("查看客户资料")
            }
        }
        .navigationDestination(isPresented: $showsCustomerDetail) {
            if let customer { CustomerDetailView(customer: customer) }
        }
        .sheet(isPresented: $isArrivalCameraPresented) {
            CameraCaptureView { image in acceptArrivalImage(image) }
                .ignoresSafeArea()
        }
        .sheet(item: $app.activeTripConflict) { trip in
            ActiveTripRecoverySheet(trip: trip, reason: $abandonReason)
        }
        .alert("无法完成到店打卡", isPresented: Binding(
            get: { !arrivalError.isEmpty },
            set: { if !$0 { arrivalError = "" } }
        )) {
            Button("知道了", role: .cancel) { arrivalError = "" }
        } message: {
            Text(arrivalError)
        }
        .onAppear { app.selectedVisit = plan }
    }

    private func prepareArrivalCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            arrivalError = "当前设备没有可用相机。到店凭证必须在真实 iPhone 上现场拍摄。"
            return
        }
        isArrivalCameraPresented = true
    }

    private func acceptArrivalImage(_ image: UIImage) {
        Task {
            do {
                let location = try await app.location.currentSystemLocation(for: .visitArrival)
                let customerLocation: CLLocation? = {
                    guard let latitude = currentPlan.latitude, let longitude = currentPlan.longitude else { return nil }
                    return CLLocation(latitude: latitude, longitude: longitude)
                }()
                if let issue = PhotoCapturePolicy.locationIssue(location, customerLocation: customerLocation) {
                    arrivalError = issue
                    return
                }
                let address = await app.location.humanReadableAddress(for: location)
                guard let evidence = PhotoEvidenceBuilder.make(
                    image: image,
                    location: location,
                    address: address,
                    customerLocation: customerLocation
                ) else {
                    arrivalError = "照片或定位凭证生成失败，请重新拍摄。"
                    return
                }
                if !(await app.arriveAtCustomer(currentPlan, evidence: evidence)) {
                    arrivalError = app.errorMessage
                }
            } catch {
                arrivalError = error.localizedDescription
            }
        }
    }

    private var completionPercent: Int {
        let otherCount = ["photos", "samples", "order", "receipt", "follow-up"]
            .filter { app.isArtifactComplete(planId: plan.planId, kind: $0) }.count
        let meetingCount = app.isMeetingComplete(planId: plan.planId) ? 1 : 0
        return min(100, 12 + (otherCount + meetingCount) * 14)
    }

    private func isDone(_ action: VisitAction) -> Bool {
        action.key == "meeting"
            ? app.isMeetingComplete(planId: plan.planId)
            : app.isArtifactComplete(planId: plan.planId, kind: action.key)
    }

    @ViewBuilder
    private func destination<Label: View>(for index: Int, @ViewBuilder label: () -> Label) -> some View {
        switch index {
        case 0: NavigationLink(destination: VisitPhotosView(plan: plan), label: label)
        case 1: NavigationLink(destination: MeetingNotesView(plan: plan), label: label)
        case 2: NavigationLink(destination: SamplesAndConsignmentView(plan: plan), label: label)
        case 3: NavigationLink(destination: OnsiteOrderView(plan: plan), label: label)
        case 4: NavigationLink(destination: CustomerReceiptView(plan: plan), label: label)
        default: NavigationLink(destination: FollowUpView(plan: plan), label: label)
        }
    }
}

private struct ActiveTripRecoverySheet: View {
    @EnvironmentObject private var app: AppState
    let trip: ActiveTripConflict
    @Binding var reason: String

    private var cannotSubmit: Bool {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || app.isBusy
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("当前未结束行程") {
                    LabeledContent("客户", value: trip.businessName)
                    LabeledContent("状态", value: trip.status)
                    LabeledContent("开始时间", value: app.region.formatTime(trip.departedAt))
                    if let address = trip.destination?.address, !address.isEmpty {
                        LabeledContent("目的地", value: address)
                    }
                }
                Section("放弃原因") {
                    TextField("例如：昨天误点出发，实际未前往", text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section {
                    Button("取消本次行程并恢复原计划", role: .destructive) {
                        Task {
                            if await app.abandonActiveTrip(reason: reason) { reason = "" }
                        }
                    }
                    .disabled(cannotSubmit)
                } footer: {
                    Text("系统会记录取消时间和原因；旧计划恢复为待出发，客户状态恢复为待拜访。")
                }
            }
            .navigationTitle("恢复旧行程")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("稍后处理") { app.activeTripConflict = nil }
                }
            }
        }
    }
}

private struct VisitAction {
    let title: String
    let subtitle: String
    let symbol: String
    let color: Color
    var key: String {
        switch title {
        case "现场照片": "photos"
        case "沟通记录": "meeting"
        case "样品 / 放货": "samples"
        case "现场订单": "order"
        case "客户签收": "receipt"
        default: "follow-up"
        }
    }
}

private struct VisitActionTile: View {
    let action: VisitAction
    let done: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: action.symbol).foregroundStyle(.white)
                    .frame(width: 36, height: 36).background(action.color, in: RoundedRectangle(cornerRadius: 10))
                Spacer()
                if done { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.quadGreen) }
            }
            Text(action.title).font(.headline)
            Text(action.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .quadCard()
    }
}

struct VisitPhotosView: View {
    @EnvironmentObject private var app: AppState
    let plan: VisitPlan
    @State private var photoData: [String: CapturedPhotoEvidence] = [:]
    @State private var uploadingCategories: Set<String> = []
    @State private var uploadedCategories: Set<String> = []
    @State private var uploadErrors: [String: String] = [:]
    @State private var pendingCategory: String?
    @State private var isCameraPresented = false
    @State private var isLocatingCategory: String?
    @State private var captureError = ""

    private let categories = [
        ("门头照片", "证明业务员已到达客户门店", "building.2.fill", "门头"),
        ("店内环境", "记录门店规模、施工区和陈列情况", "square.grid.2x2.fill", "店内"),
        ("产品 / 样品", "记录展示样品及客户感兴趣的产品", "shippingbox.fill", "产品样品"),
        ("放货凭证", "货物留店时拍摄型号、数量和现场", "doc.text.image.fill", "放货凭证")
    ]

    private var customerLocation: CLLocation? {
        guard let latitude = plan.latitude, let longitude = plan.longitude else { return nil }
        return CLLocation(latitude: latitude, longitude: longitude)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(kicker: "本次拜访", title: plan.customerName, subtitle: "仅限现场拍摄 · 每张照片绑定手机定位", badge: "已有 \(photoData.count) 张")
                ForEach(categories, id: \.0) { category in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: category.2).foregroundStyle(.white)
                                .frame(width: 36, height: 36).background(Color.quadTeal, in: RoundedRectangle(cornerRadius: 10))
                            VStack(alignment: .leading) { Text(category.0).font(.headline); Text(category.1).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            if uploadingCategories.contains(category.3) {
                                HStack(spacing: 6) {
                                    ProgressView().controlSize(.small)
                                    Text("自动上传中").font(.caption.weight(.semibold))
                                }
                                .foregroundStyle(Color.quadTeal)
                            } else if uploadedCategories.contains(category.3) {
                                QuadStatusPill(title: "已上传", color: .quadGreen, icon: "checkmark")
                            } else if photoData[category.3] != nil {
                                QuadStatusPill(title: "等待上传", color: .quadOrange, icon: "clock")
                            }
                        }
                        HStack(spacing: 10) {
                            if let evidence = photoData[category.3] { PhotoPreviewTile(data: evidence.data, title: category.0) }
                            Button { prepareCamera(for: category.3) } label: {
                                VStack(spacing: 8) {
                                    Image(systemName: "camera.fill").font(.title2)
                                    Text(
                                        isLocatingCategory == category.3
                                            ? "正在绑定位置并上传…"
                                            : (photoData[category.3] == nil ? "现场拍照" : "重新拍照")
                                    )
                                    .font(.caption)
                                }
                                    .foregroundStyle(Color.quadTeal).frame(maxWidth: .infinity, minHeight: 110)
                                    .background(Color.quadTeal.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                            }
                            .disabled(
                                isLocatingCategory != nil
                                || isCameraPresented
                                || uploadingCategories.contains(category.3)
                            )
                        }
                        if let evidence = photoData[category.3] { PhotoLocationEvidenceView(evidence: evidence) }
                        if let uploadError = uploadErrors[category.3],
                           let evidence = photoData[category.3] {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(uploadError)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Button("重新上传") {
                                    Task { await uploadPhotoAutomatically(evidence, category: category.3) }
                                }
                                .font(.caption.weight(.bold))
                            }
                        }
                    }
                    .quadCard()
                }
                Label("拍照完成后会自动绑定定位、保存并上传，不需要再点保存。", systemImage: "arrow.up.circle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.quadTeal)
                    .frame(maxWidth: .infinity)
                if photoData["门头"] == nil {
                    Text("门头照片和有效定位是本次到店考核的必填凭证。")
                        .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("现场照片")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isCameraPresented) {
            CameraCaptureView { image in acceptCapturedImage(image) }
                .ignoresSafeArea()
        }
        .alert("无法完成现场拍照", isPresented: Binding(
            get: { !captureError.isEmpty },
            set: { if !$0 { captureError = "" } }
        )) {
            Button("知道了", role: .cancel) { captureError = "" }
        } message: {
            Text(captureError)
        }
    }

    private func prepareCamera(for category: String) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            captureError = "当前设备没有可用相机。现场凭证禁止从相册选择，请在真实 iPhone 上拍摄。"
            return
        }
        pendingCategory = category
        isCameraPresented = true
    }

    private func acceptCapturedImage(_ image: UIImage) {
        guard let pendingCategory else { return }
        let capturedAt = Date()
        self.pendingCategory = nil
        Task {
            isLocatingCategory = pendingCategory
            defer { isLocatingCategory = nil }
            do {
                let location = try await app.location.currentSystemLocation(for: .fieldEvidence)
                if let issue = PhotoCapturePolicy.locationIssue(location, customerLocation: customerLocation) {
                    captureError = issue
                    return
                }
                let address = await app.location.humanReadableAddress(for: location)
                guard let evidence = PhotoEvidenceBuilder.make(
                    image: image,
                    location: location,
                    capturedAt: capturedAt,
                    address: address,
                    customerLocation: customerLocation
                ) else {
                    captureError = "照片或定位凭证生成失败，请重新现场拍摄。"
                    return
                }
                photoData[pendingCategory] = evidence
                uploadedCategories.remove(pendingCategory)
                uploadErrors.removeValue(forKey: pendingCategory)
                await uploadPhotoAutomatically(evidence, category: pendingCategory)
            } catch {
                captureError = "照片已经拍摄，但手机暂时没有可用的综合位置。请开启系统定位、Wi-Fi 或蜂窝网络后重新拍摄：\(error.localizedDescription)"
            }
        }
    }

    private func uploadPhotoAutomatically(_ evidence: CapturedPhotoEvidence, category: String) async {
        guard !uploadingCategories.contains(category) else { return }
        uploadingCategories.insert(category)
        uploadErrors.removeValue(forKey: category)
        defer { uploadingCategories.remove(category) }

        if await app.uploadPhoto(evidence: evidence, category: category, plan: plan) {
            guard photoData[category]?.id == evidence.id else { return }
            uploadedCategories.insert(category)
        } else {
            guard photoData[category]?.id == evidence.id else { return }
            uploadErrors[category] = app.errorMessage.isEmpty
                ? "自动上传暂未完成，请点击重新上传"
                : app.errorMessage
        }
    }
}

struct MeetingNotesView: View {
    @EnvironmentObject private var app: AppState
    let plan: VisitPlan

    private var transcript: String { app.meetingTranscript(for: plan.planId) }
    private var analysis: String { app.meetingAnalysis(for: plan.planId) }
    private var isThisPlanRecording: Bool {
        app.recorder.isRecording && app.recorder.activePlanId == plan.planId
    }
    private var isThisPlanStarting: Bool {
        app.recorder.isStarting && app.recorder.activePlanId == plan.planId
    }
    private var isAnotherPlanRecording: Bool {
        (app.recorder.isRecording || app.recorder.isStarting) && app.recorder.activePlanId != plan.planId
    }
    private var transcriptBinding: Binding<String> {
        Binding(
            get: { app.meetingTranscript(for: plan.planId) },
            set: { app.updateMeetingTranscript($0, planId: plan.planId) }
        )
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "本次拜访 · 联系人 \(plan.contactName ?? "未填写")",
                    title: plan.customerName,
                    subtitle: "现场会议纪要",
                    badge: isThisPlanStarting
                        ? "正在启动"
                        : isThisPlanRecording
                        ? (app.recorder.isTranscribing ? "实时转写中" : "录音中")
                        : (isAnotherPlanRecording ? "其他客户录音中" : (transcript.isEmpty ? "待开始" : "草稿已恢复"))
                )
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("现场会议纪要").font(.headline)
                            Text(isThisPlanRecording || isThisPlanStarting
                                 ? app.recorder.status
                                 : (isAnotherPlanRecording ? "另一位客户正在录音，本页不会接收其文字" : "本客户文字草稿会自动保存在本机"))
                                .font(.caption)
                                .foregroundStyle(isThisPlanRecording || isAnotherPlanRecording ? .red : .secondary)
                            if isThisPlanRecording {
                                Text("\(app.recorder.recognitionEngine) · \(app.recorder.inputLevel > 0.008 ? "麦克风收到声音" : "等待清晰讲话")")
                                    .font(.caption2)
                                    .foregroundStyle(app.recorder.inputLevel > 0.008 ? Color.quadGreen : .secondary)
                            }
                        }
                        Spacer()
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(isThisPlanStarting
                                 ? "准备中"
                                 : (isThisPlanRecording ? app.recorder.formattedElapsed(at: context.date) : "待开始"))
                                .font(.caption.weight(.bold).monospacedDigit())
                                .foregroundStyle(Color.quadPurple)
                        }
                    }
                    HStack {
                        Button("开始语音转文字", systemImage: "play.fill") {
                            app.selectedVisit = plan
                            Task { await app.startRecording(for: plan) }
                        }
                        .buttonStyle(.borderedProminent).tint(.quadPurple)
                        .disabled(isThisPlanRecording || isAnotherPlanRecording || isThisPlanStarting)

                        Button("结束语音转文字", systemImage: "stop.fill") {
                            app.selectedVisit = plan
                            Task { await app.stopRecording(for: plan) }
                        }
                        .buttonStyle(.borderedProminent).tint(.red)
                        .disabled(!isThisPlanRecording || isThisPlanStarting)
                    }
                    Text("点击“结束语音转文字”后，录音、文字、AI 总结会自动保存并上传；音频每 4 分钟自动安全保存。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 9) {
                    QuadSectionHeader(title: "会议文字记录", trailing: "可人工修订")
                    TextEditor(text: transcriptBinding).frame(minHeight: 170)
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color(uiColor: .separator)) }
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(
                        title: "AI 中文分析",
                        trailing: app.meetingAnalysisStatus(for: plan.planId)
                    )
                    if analysis.isEmpty {
                        if app.isMeetingAnalysisRunning(for: plan.planId) {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("录音已经安全结束，正在自动生成会议总结…")
                                    .font(.subheadline)
                            }
                        } else {
                            ContentUnavailableView(
                                "还没有分析结果",
                                systemImage: "sparkles",
                                description: Text("结束语音转文字后会自动生成；断网时登记待处理，联网后自动补做")
                            )
                        }
                    } else {
                        Text(analysis).font(.subheadline).textSelection(.enabled)
                    }
                    Button(analysis.isEmpty ? "立即生成 AI 总结" : "重新生成 AI 总结", systemImage: "sparkles") {
                        app.selectedVisit = plan
                        Task { await app.analyzeMeeting(for: plan) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.quadPurple)
                    .disabled(
                        transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || app.isMeetingAnalysisRunning(for: plan.planId)
                    )
                }
                .quadCard()

                Label(
                    app.isMeetingComplete(planId: plan.planId)
                        ? "沟通记录、AI 总结已经自动保存并上传"
                        : "结束录音后系统会自动保存、生成 AI 总结并上传",
                    systemImage: app.isMeetingComplete(planId: plan.planId)
                        ? "checkmark.circle.fill"
                        : "arrow.triangle.2.circlepath"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(
                    app.isMeetingComplete(planId: plan.planId)
                        ? Color.quadGreen
                        : Color.quadTeal
                )
                .frame(maxWidth: .infinity)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("沟通记录")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            app.selectedVisit = plan
            app.prepareMeetingDraft(for: plan)
            Task { await app.recorder.refreshPendingCount() }
        }
        .onDisappear { app.persistMeetingDraft(for: plan.planId) }
    }
}

struct SamplesAndConsignmentView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    let plan: VisitPlan
    @State private var mode = "试用放货"
    @State private var products = [
        VisitProductLine(name: "QD15 陶瓷隔热膜", sku: "QD15-BLK-15218", quantity: 2, unitPrice: 300),
        VisitProductLine(name: "QD35 展示样品", sku: "QD35-SAMPLE", unit: "片", quantity: 5, unitPrice: 20)
    ]
    @State private var warehouse = ""
    @State private var paymentStatus = "部分收款"
    @State private var received = 100.0
    @State private var paymentMethod = ""
    @State private var notes = ""

    private var total: Double { products.reduce(0) { $0 + $1.amount } }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(kicker: "本次拜访 · 联系人 \(plan.contactName ?? "未填写")", title: plan.customerName, subtitle: "关联正式产品、库存和客户应收", color: .quadTeal, badge: "已到店")
                Picker("业务类型", selection: $mode) { Text("免费样品").tag("免费样品"); Text("试用放货").tag("试用放货") }
                    .pickerStyle(.segmented)
                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "产品明细", trailing: "结构化保存")
                    ForEach($products) { $product in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { VStack(alignment: .leading) { Text(product.name).font(.headline); Text("SKU：\(product.sku) · 单位：\(product.unit)").font(.caption).foregroundStyle(.secondary) }; Spacer(); Button(role: .destructive) { products.removeAll { $0.id == product.id } } label: { Image(systemName: "xmark.circle") } }
                            HStack {
                                TextField("数量", value: $product.quantity, format: .number).keyboardType(.decimalPad)
                                TextField("约定单价", value: $product.unitPrice, format: .number).keyboardType(.decimalPad)
                                Text(app.region.formatCurrency(product.amount)).font(.subheadline.weight(.bold)).frame(minWidth: 68)
                            }
                            .textFieldStyle(.roundedBorder)
                        }
                        if product.id != products.last?.id { Divider() }
                    }
                    Button("添加产品", systemImage: "plus") { products.append(VisitProductLine(name: "新产品", sku: "待选择", quantity: 1, unitPrice: 0)) }.buttonStyle(.bordered)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: "试用与收款约定")
                    Picker("出货仓库", selection: $warehouse) {
                        ForEach(app.region.warehouseNames, id: \.self) { Text($0) }
                    }
                    Picker("收款状态", selection: $paymentStatus) { Text("未收款").tag("未收款"); Text("部分收款").tag("部分收款"); Text("已收清").tag("已收清") }
                    TextField("本次已收金额", value: $received, format: .number).keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    Picker("付款方式", selection: $paymentMethod) {
                        ForEach(app.region.paymentMethods, id: \.self) { Text($0) }
                    }
                    TextField("补充备注", text: $notes, axis: .vertical).textFieldStyle(.roundedBorder)
                }
                .quadCard()

                HStack(spacing: 0) {
                    QuadMetric(value: app.region.formatCurrency(total), label: "货品总额", color: .quadOrange)
                    QuadMetric(value: app.region.formatCurrency(received), label: "本次已收", color: .quadOrange)
                    QuadMetric(value: app.region.formatCurrency(max(0, total - received)), label: "客户欠款", color: .quadOrange)
                }
                .quadCard()
                QuadPrimaryButton(title: "保存并进入客户签收", systemImage: "arrow.right", color: .quadTeal) {
                    Task {
                        let saved = await app.saveArtifact(kind: "samples", values: ["mode": mode, "warehouse": warehouse, "paymentStatus": paymentStatus, "received": received.description, "paymentMethod": paymentMethod, "notes": notes], products: products, plan: plan)
                        if saved { dismiss() }
                    }
                }
                Text("保存后由服务器按权限生成库存、客户应收和预计收款任务；App 不伪造库存结果。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("样品 / 放货")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if warehouse.isEmpty { warehouse = app.region.warehouseNames.first ?? "" }
            if paymentMethod.isEmpty { paymentMethod = app.region.paymentMethods.first ?? "" }
        }
    }
}

struct OnsiteOrderView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    let plan: VisitPlan
    @State private var products = [
        VisitProductLine(name: "QD15 陶瓷隔热膜", sku: "QD15-BLK-15218", quantity: 6, unitPrice: 360),
        VisitProductLine(name: "QD35 陶瓷隔热膜", sku: "QD35-BLK-15218", quantity: 4, unitPrice: 330, discount: 60)
    ]
    @State private var delivery = ""
    @State private var payment = ""
    @State private var received = 1_000.0
    @State private var dueDate = Calendar.current.date(byAdding: .day, value: 8, to: Date()) ?? Date()
    @State private var notes = ""

    private var total: Double { products.reduce(0) { $0 + $1.amount } }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(kicker: "联系人 \(plan.contactName ?? "未填写")", title: plan.customerName, subtitle: "现场销售订单", badge: "订单号保存后生成")
                VStack(alignment: .leading, spacing: 13) {
                    QuadSectionHeader(title: "订单信息")
                    LabeledContent("业务员 · 可选可填", value: app.user?.displayName ?? "当前业务员")
                    LabeledContent("订单类型 · 可选可填", value: "批发订单")
                    LabeledContent("出货仓库 · 可选可填", value: app.region.warehouseNames.first ?? "—")
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "订单产品", trailing: "正式产品数据")
                    ForEach($products) { $product in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { VStack(alignment: .leading) { Text(product.name).font(.headline); Text("SKU：\(product.sku) · 单位：\(product.unit)").font(.caption).foregroundStyle(.secondary) }; Spacer(); Button(role: .destructive) { products.removeAll { $0.id == product.id } } label: { Image(systemName: "xmark.circle") } }
                            HStack {
                                TextField("数量", value: $product.quantity, format: .number).keyboardType(.decimalPad)
                                TextField("成交单价", value: $product.unitPrice, format: .number).keyboardType(.decimalPad)
                                TextField("折扣", value: $product.discount, format: .number).keyboardType(.decimalPad)
                            }.textFieldStyle(.roundedBorder)
                        }
                        Divider()
                    }
                    Button("选择或输入产品", systemImage: "plus") { products.append(VisitProductLine(name: "新产品", sku: "待选择", quantity: 1, unitPrice: 0)) }.buttonStyle(.bordered)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: "交付与付款")
                    Picker("交付方式 · 可选可填", selection: $delivery) {
                        ForEach(app.region.deliveryMethods, id: \.self) { Text($0) }
                    }
                    Picker("付款方式 · 可选可填", selection: $payment) {
                        ForEach(app.region.paymentMethods, id: \.self) { Text($0) }
                    }
                    DatePicker("余款到期日", selection: $dueDate, displayedComponents: .date)
                    TextField("本次已收", value: $received, format: .number).keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("订单备注", text: $notes, axis: .vertical).textFieldStyle(.roundedBorder)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 8) {
                    QuadSectionHeader(title: "订单金额")
                    LabeledContent("商品金额", value: app.region.formatCurrency(total))
                    LabeledContent("本次已收", value: app.region.formatCurrency(received))
                    LabeledContent("客户欠款", value: app.region.formatCurrency(max(0, total - received)))
                    LabeledContent("产品", value: "\(products.reduce(0) { $0 + Int($1.quantity) }) \(products.first?.unit ?? "件")")
                }
                .quadCard()

                QuadPrimaryButton(title: "创建订单并进入客户签收", systemImage: "arrow.right", color: .quadTeal) {
                    Task {
                        let saved = await app.saveArtifact(kind: "order", values: ["delivery": delivery, "payment": payment, "received": received.description, "dueDate": dueDate.ISO8601Format(), "notes": notes, "total": total.description], products: products, plan: plan)
                        if saved { dismiss() }
                    }
                }
                Text("订单提交必须经过服务器权限和正式订单规则；App 不在本地伪造订单号或库存出库。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("现场订单")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if delivery.isEmpty { delivery = app.region.deliveryMethods.first ?? "" }
            if payment.isEmpty { payment = app.region.paymentMethods.first ?? "" }
        }
    }
}

struct CustomerReceiptView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    let plan: VisitPlan
    @State private var receivedConfirmed = true
    @State private var balanceConfirmed = true
    @State private var printedName = ""
    @State private var title = ""
    @State private var strokes: [[CGPoint]] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "现场交货 · 联系人 \(plan.contactName ?? "未填写")",
                    title: plan.customerName,
                    subtitle: app.region.localized(us: "Customer Delivery Receipt", cn: "客户交货签收单"),
                    badge: app.region.documentDisplayName
                )
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(
                        title: app.region.localized(us: "Delivery Receipt", cn: "交货签收单"),
                        trailing: app.region.documentLanguage.uppercased()
                    )
                    LabeledContent(app.region.localized(us: "Order Number", cn: "订单编号"), value: "SO-2026-00128")
                    LabeledContent(app.region.localized(us: "Delivery Date", cn: "交货日期"), value: app.region.formatDate(Date()))
                    LabeledContent(app.region.localized(us: "Sales Representative", cn: "业务员"), value: app.user?.displayName ?? "当前业务员")
                    LabeledContent(app.region.localized(us: "Delivery Location", cn: "交货地点"), value: plan.customerName)
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(
                        title: app.region.localized(us: "Products Received", cn: "签收产品"),
                        trailing: app.region.localized(us: "10 rolls", cn: "10 卷")
                    )
                    HStack {
                        Text("QD15 Ceramic Film")
                        Spacer()
                        Text(app.region.localized(us: "6 rolls", cn: "6 卷") + " · " + app.region.formatCurrency(2_040)).fontWeight(.semibold)
                    }
                    Divider()
                    HStack {
                        Text("QD35 Ceramic Film")
                        Spacer()
                        Text(app.region.localized(us: "4 rolls", cn: "4 卷") + " · " + app.region.formatCurrency(1_440)).fontWeight(.semibold)
                    }
                    HStack(spacing: 0) {
                        QuadMetric(value: app.region.formatCurrency(3_420), label: app.region.localized(us: "Total", cn: "合计"))
                        QuadMetric(value: app.region.formatCurrency(1_000), label: app.region.localized(us: "Paid", cn: "已收"), color: .quadGreen)
                        QuadMetric(value: app.region.formatCurrency(2_420), label: app.region.localized(us: "Balance", cn: "余款"), color: .quadOrange)
                    }
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: app.region.localized(us: "Customer Confirmation", cn: "客户确认"))
                    Toggle(
                        app.region.localized(
                            us: "I confirm that the products and quantities listed above have been received in good condition.",
                            cn: "本人确认上述产品和数量已经完好收到。"
                        ),
                        isOn: $receivedConfirmed
                    )
                    Toggle(
                        app.region.localized(
                            us: "I acknowledge the remaining balance of \(app.region.formatCurrency(2_420)) is due as agreed.",
                            cn: "本人确认剩余款项 \(app.region.formatCurrency(2_420)) 将按约定日期支付。"
                        ),
                        isOn: $balanceConfirmed
                    )
                }
                .font(.subheadline)
                .quadCard()
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(
                        title: app.region.localized(us: "Customer Signature", cn: "客户签名"),
                        trailing: strokes.isEmpty ? app.region.localized(us: "Required", cn: "必填") : app.region.localized(us: "Captured", cn: "已签名")
                    )
                    HStack {
                        TextField(app.region.localized(us: "Printed Name", cn: "签收人姓名"), text: $printedName)
                        TextField(app.region.localized(us: "Title", cn: "职位"), text: $title)
                    }
                    .textFieldStyle(.roundedBorder)
                    SignaturePad(strokes: $strokes)
                    Button(app.region.localized(us: "Clear Signature", cn: "清除签名")) { strokes = [] }.buttonStyle(.bordered)
                }
                .quadCard()
                QuadPrimaryButton(
                    title: app.region.localized(us: "Confirm and Save Receipt", cn: "确认签收并生成中文签收单"),
                    systemImage: "signature",
                    isEnabled: receivedConfirmed && balanceConfirmed && !printedName.isEmpty && (!strokes.isEmpty || app.isDesignPreview)
                ) {
                    Task {
                        let saved = await app.saveArtifact(kind: "receipt", values: ["printedName": printedName, "title": title, "total": "3420", "paid": "1000", "balance": "2420", "signatureCaptured": (!strokes.isEmpty).description], plan: plan)
                        if saved { dismiss() }
                    }
                }
                Text("签名、签收时间、手机定位、产品和欠款信息将一并保存。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("客户签收")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if printedName.isEmpty { printedName = plan.contactName ?? "" }
            if title.isEmpty { title = app.region.localized(us: "Owner", cn: "负责人") }
        }
    }
}

struct FollowUpView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    let plan: VisitPlan
    @State private var method = "到店回访"
    @State private var type = "样品测试跟进"
    @State private var date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var owner = "Chrissie 万卉"
    @State private var reminder = "提前 1 天"
    @State private var reason = "确认 QD15 样品隔热效果与施工稳定性；带正式价格表，讨论批量采购。"

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(kicker: "本次拜访 · 11:31 已签收", title: plan.customerName, subtitle: "客户欠款 $2,420", badge: "待跟进")
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(title: "AI 建议跟进事项", trailing: "编辑后保存")
                    ForEach(["9 月 4 日回访 QD15 样品测试结果。", "9 月 5 日前跟进订单余款 $2,420。", "发送正式价格表并确认批量采购数量。"], id: \.self) { item in
                        Label(item, systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(.primary)
                    }
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: "建立主要跟进任务", trailing: "可新增任务")
                    Picker("跟进方式 · 可选可填", selection: $method) { ForEach(["到店回访", "电话", "邮件", "微信"], id: \.self) { Text($0) } }
                    Picker("任务类型 · 可选可填", selection: $type) { ForEach(["样品测试跟进", "收款提醒", "报价跟进"], id: \.self) { Text($0) } }
                    DatePicker("跟进日期和时间", selection: $date)
                    TextField("负责人 · 可选可填", text: $owner).textFieldStyle(.roundedBorder)
                    Picker("提醒时间", selection: $reminder) { ForEach(["提前 1 小时", "提前 1 天", "提前 3 天"], id: \.self) { Text($0) } }
                    TextField("跟进原因", text: $reason, axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder)
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(title: "关联业务数据")
                    ArtifactChecklistRow(title: "QD15 样品试用", detail: "2 卷 · 试用截止 2026/09/04")
                    Divider()
                    ArtifactChecklistRow(title: "订单 SO-2026-00128", detail: "欠款 $2,420 · 2026/09/05 到期")
                }
                .quadCard()
                QuadPrimaryButton(title: "保存跟进任务", systemImage: "checkmark", color: .quadTeal) {
                    Task {
                        let saved = await app.saveArtifact(kind: "follow-up", values: ["method": method, "type": type, "date": date.ISO8601Format(), "owner": owner, "reminder": reminder, "reason": reason], plan: plan)
                        if saved { dismiss() }
                    }
                }
                Text("任务将出现在负责人日程、客户资料和应收款提醒中。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("下次跟进")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct VisitCompletionView: View {
    @EnvironmentObject private var app: AppState
    let plan: VisitPlan
    @State private var summary = ""

    private var checklist: [(String, String, Bool)] {
        [
            ("现场照片", "照片和定位凭证", app.isArtifactComplete(planId: plan.planId, kind: "photos")),
            ("会议纪要", "语音转文字与总结", app.isMeetingComplete(planId: plan.planId)),
            ("样品 / 放货", "样品和放货记录", app.isArtifactComplete(planId: plan.planId, kind: "samples")),
            ("现场订单", "客户订单记录", app.isArtifactComplete(planId: plan.planId, kind: "order")),
            ("客户签收", "签名业务单据", app.isArtifactComplete(planId: plan.planId, kind: "receipt")),
            ("下次跟进", "后续任务", app.isArtifactComplete(planId: plan.planId, kind: "follow-up"))
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(kicker: "本次拜访资料已经完整", title: plan.customerName, subtitle: "准备离店", color: .quadGreen, badge: "完成", metrics: [("到店时间", "10:31"), ("离店时间", "11:42"), ("店内用时", "1时11分")])
                VStack(alignment: .leading, spacing: 11) {
                    QuadSectionHeader(title: "资料完成情况", trailing: "\(checklist.filter(\.2).count) / \(checklist.count)")
                    ForEach(checklist, id: \.0) { item in
                        ArtifactChecklistRow(title: item.0, detail: item.2 ? "已保存 · \(item.1)" : "待补充 · \(item.1)")
                        Divider()
                    }
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 9) {
                    QuadSectionHeader(title: "AI 拜访总结", trailing: "可修改")
                    TextEditor(text: $summary).frame(minHeight: 130)
                }
                .quadCard()
                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(title: "本次拜访结果")
                    HStack(spacing: 0) {
                        QuadMetric(value: "\(checklist.filter(\.2).count)", label: "已完成资料", color: .quadGreen)
                        QuadMetric(value: "\(checklist.filter { !$0.2 }.count)", label: "待补充资料", color: .quadOrange)
                        QuadMetric(value: plan.status, label: "计划状态", color: .quadTeal)
                    }
                }
                .quadCard()
                VStack(spacing: 10) {
                    QuadPrimaryButton(title: "完成拜访并前往下一家", systemImage: "arrow.right", color: .quadGreen) { Task { _ = await app.completeVisit(endDay: false, summary: summary) } }
                    Button("完成拜访并结束今日行程") { Task { _ = await app.completeVisit(endDay: true, summary: summary) } }.buttonStyle(.bordered).tint(.quadGreen)
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("完成拜访")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if summary.isEmpty {
                let completed = checklist.filter(\.2).map(\.0).joined(separator: "、")
                let pending = checklist.filter { !$0.2 }.map(\.0).joined(separator: "、")
                summary = "本次拜访客户：\(plan.customerName)。\n已保存资料：\(completed.isEmpty ? "暂无" : completed)。\n待补充资料：\(pending.isEmpty ? "无" : pending)。"
            }
        }
    }
}
