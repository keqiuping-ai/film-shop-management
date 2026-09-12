import SwiftUI
import UIKit
import CoreLocation
import ImageIO
import UniformTypeIdentifiers
@preconcurrency import Vision

struct NewCustomerView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var draft = CustomerDraft()
    @State private var pendingLocation: CLLocation?
    @State private var isCameraPresented = false
    @State private var isLocating = false
    @State private var captureError = ""
    @State private var isRecognizing = false
    @State private var recognizedCount = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Button(action: prepareCamera) {
                    HStack(spacing: 12) {
                        Image(systemName: "text.viewfinder")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 48, height: 48)
                            .background(Color.quadTeal, in: RoundedRectangle(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(isLocating ? "正在核验定位…" : "现场拍摄名片，AI 自动识别")
                                .font(.headline)
                            Text("优先识别公司、联系人、职务、手机、邮箱和地址；也支持网页资料照片")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.secondary)
                    }
                }
                .quadCard()
                .buttonStyle(.plain)
                if isRecognizing || recognizedCount > 0 {
                    Text(isRecognizing ? "正在识别照片…" : "已识别并填入 \(recognizedCount) 项资料")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.quadTeal)
                }

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "公司资料", trailing: "带 * 为必填")
                    TextField("公司名称 *", text: $draft.customerName)
                    TextField("省 / 市 / 区 / 街道 / 门牌号 *", text: $draft.address, axis: .vertical)
                    TextField("客户类型，例如贴膜门店", text: $draft.customerType)
                }
                .textFieldStyle(.roundedBorder)
                .quadCard()

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "主要联系人", trailing: "名片资料")
                    TextField("联系人姓名，例如贵州平", text: $draft.contactName)
                    TextField("联系人职务，例如董事长 / 总经理", text: $draft.contactTitle)
                    TextField("联系人手机号，例如 138 0000 0000", text: $draft.phone).keyboardType(.phonePad)
                    TextField("联系人电子邮箱", text: $draft.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                }
                .textFieldStyle(.roundedBorder)
                .quadCard()

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "业务资料", trailing: "可选")
                    Picker("客户来源", selection: $draft.sourceChannel) {
                        ForEach(["名片现场拍照", "网页资料", "业务员发现", "客户介绍"], id: \.self) { Text($0) }
                    }
                    LabeledContent("添加人", value: app.user?.displayName ?? app.user?.loginName ?? "当前登录人员")
                    TextField("客户备注", text: $draft.notes, axis: .vertical).lineLimit(3...6)
                }
                .textFieldStyle(.roundedBorder)
                .quadCard()

                QuadPrimaryButton(
                    title: app.isBusy ? "正在保存…" : "保存到客户列表",
                    systemImage: "checkmark",
                    isEnabled: !app.isBusy && !draft.customerName.isEmpty && !draft.address.isEmpty
                ) {
                    draft.countryCode = app.region.countryCode
                    Task { if await app.createCustomer(draft) { dismiss() } }
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("新增客户")
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
        .task {
            guard app.isDesignPreview,
                  ProcessInfo.processInfo.arguments.contains("-preview-business-card") else { return }
            applyScanResult(CustomerTextRecognizer.parse(lines: [
                "九江力达科技有限公司",
                "贵州平 董事长",
                "手机：138 0000 0182",
                "sales@lida.example",
                "江西省九江市濂溪区工业园路 88 号"
            ]))
        }
    }

    private func prepareCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            captureError = "当前设备没有可用相机。现场照片禁止从相册选择，请在真实 iPhone 上拍摄。"
            return
        }
        Task {
            isLocating = true
            defer { isLocating = false }
            do {
                let location = try await app.location.currentSystemLocation(for: .customerRecognition)
                pendingLocation = location
                isCameraPresented = true
            } catch {
                captureError = "请允许定位；系统会直接使用手机当前可用位置：\(error.localizedDescription)"
            }
        }
    }

    private func acceptCapturedImage(_ image: UIImage) {
        guard let pendingLocation,
              let evidence = PhotoEvidenceBuilder.make(image: image, location: pendingLocation) else {
            captureError = "照片或定位凭证生成失败，请重新现场拍摄。"
            return
        }
        self.pendingLocation = nil
        Task {
            isRecognizing = true
            defer { isRecognizing = false }
            if let result = try? await CustomerTextRecognizer.recognize(evidence.data) {
                applyScanResult(result)
            }
        }
    }

    private func applyScanResult(_ result: CustomerScanResult) {
        if draft.customerName.isEmpty { draft.customerName = result.companyName }
        if draft.address.isEmpty { draft.address = result.address }
        if draft.contactName.isEmpty { draft.contactName = result.contactName }
        if draft.contactTitle.isEmpty { draft.contactTitle = result.contactTitle }
        if draft.phone.isEmpty { draft.phone = result.phone }
        if draft.email.isEmpty { draft.email = result.email }
        if !result.contactName.isEmpty || !result.contactTitle.isEmpty { draft.sourceChannel = "名片现场拍照" }
        recognizedCount = [
            draft.customerName, draft.address, draft.contactName,
            draft.contactTitle, draft.phone, draft.email
        ].filter { !$0.isEmpty }.count
    }
}

enum PhotoCapturePolicy {
    static let maximumAccuracyM = 1_000.0
    static let maximumCustomerDistanceM = 500.0
    static let maximumLocationAgeSeconds: TimeInterval = 180

    static func locationIssue(_ location: CLLocation, customerLocation _: CLLocation? = nil) -> String? {
        let age = abs(Date().timeIntervalSince(location.timestamp))
        guard age <= maximumLocationAgeSeconds else {
            return "手机位置已经超过 3 分钟，请重新获取当前位置后再继续。"
        }
        guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= maximumAccuracyM else {
            return "当前手机定位过于粗略（约 ±\(Int(max(0, location.horizontalAccuracy))) 米）。请开启定位、Wi-Fi 或蜂窝网络后重试。"
        }
        return nil
    }
}

enum PhotoEvidenceBuilder {
    static func make(
        image: UIImage,
        location: CLLocation,
        capturedAt: Date = Date(),
        address: String? = nil,
        customerLocation: CLLocation? = nil
    ) -> CapturedPhotoEvidence? {
        guard let data = jpegDataWithGPS(image: image, location: location, capturedAt: capturedAt) else { return nil }
        return CapturedPhotoEvidence(
            id: UUID(),
            data: data,
            capturedAt: capturedAt,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracyM: location.horizontalAccuracy,
            address: address,
            distanceToCustomerM: customerLocation.map { location.distance(from: $0) }
        )
    }

    private static func jpegDataWithGPS(image: UIImage, location: CLLocation, capturedAt: Date) -> Data? {
        guard let original = image.jpegData(compressionQuality: 0.9),
              let source = CGImageSourceCreateWithData(original as CFData, nil),
              let type = CGImageSourceGetType(source) else { return nil }

        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, type, 1, nil) else { return nil }
        var properties = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]

        let coordinate = location.coordinate
        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        dateFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        dateFormatter.dateFormat = "yyyy:MM:dd"
        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale(identifier: "en_US_POSIX")
        timeFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        timeFormatter.dateFormat = "HH:mm:ss.SSSSSS"

        properties[kCGImagePropertyGPSDictionary] = [
            kCGImagePropertyGPSLatitude: abs(coordinate.latitude),
            kCGImagePropertyGPSLatitudeRef: coordinate.latitude >= 0 ? "N" : "S",
            kCGImagePropertyGPSLongitude: abs(coordinate.longitude),
            kCGImagePropertyGPSLongitudeRef: coordinate.longitude >= 0 ? "E" : "W",
            kCGImagePropertyGPSHPositioningError: location.horizontalAccuracy,
            kCGImagePropertyGPSDateStamp: dateFormatter.string(from: capturedAt),
            kCGImagePropertyGPSTimeStamp: timeFormatter.string(from: capturedAt)
        ] as [CFString: Any]
        CGImageDestinationAddImageFromSource(destination, source, 0, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}

struct CameraCaptureView: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraCaptureView
        init(parent: CameraCaptureView) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onCapture(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

struct PhotoLocationEvidenceView: View {
    let evidence: CapturedPhotoEvidence

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label("相机现场拍摄 · 手机定位已绑定", systemImage: "location.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.quadGreen)
            if let address = evidence.address, !address.isEmpty {
                Text(address)
                    .font(.caption.weight(.semibold))
            }
            Text("\(evidence.coordinateText) · 精度 ±\(Int(evidence.accuracyM)) 米 · \(evidence.capturedAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let distance = evidence.distanceToCustomerM {
                Text("距客户建档坐标约 \(Int(distance)) 米，仅供参考，不影响保存")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct CustomerListView: View {
    @EnvironmentObject private var app: AppState
    @State private var search = ""
    @State private var scope = "全部地区"

    private var scopeOptions: [String] {
        let source = app.customers
        var cities: [String] = []
        for customer in source where !customer.cityLabel.isEmpty && !cities.contains(customer.cityLabel) {
            cities.append(customer.cityLabel)
        }
        return ["全部地区"] + Array(cities.prefix(2))
    }

    private var filtered: [CustomerSummary] {
        app.customers.filter { customer in
            let matchesSearch = search.isEmpty || [customer.customerName, customer.address, customer.phone, customer.contactName]
                .joined(separator: " ").localizedCaseInsensitiveContains(search)
            let matchesScope = scope == "全部地区" || customer.cityLabel.localizedCaseInsensitiveContains(scope)
            return matchesSearch && matchesScope
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(app.customerDirectoryTitle).font(.title2.weight(.bold))
                        Text(app.customerDirectorySubtitle).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(filtered.count) 家").font(.headline).foregroundStyle(Color.quadTeal)
                }
                .quadCard()

                HStack(spacing: 8) {
                    ForEach(scopeOptions, id: \.self) { item in
                        Button(item) { scope = item }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(scope == item ? .white : .primary)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(scope == item ? Color.quadTeal : Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
                    }
                }
                .scrollClipDisabled()

                ForEach(filtered) { customer in
                    VStack(spacing: 12) {
                        CustomerCompactCard(customer: customer) {
                            if let distance = customer.distanceMiles {
                                Text(app.region.formatDistance(miles: distance))
                                    .font(.subheadline.weight(.bold)).foregroundStyle(Color.quadTeal)
                            }
                        }
                        Divider()
                        HStack {
                            NavigationLink("查看资料") { CustomerDetailView(customer: customer) }
                                .buttonStyle(.bordered)
                            Spacer()
                            Button(app.selectedCustomerIDs.contains(customer.id) ? "已加入计划" : "加入拜访计划") {
                                app.selectedCustomerIDs.insert(customer.id)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(app.selectedCustomerIDs.contains(customer.id) ? .green : .quadTeal)
                            .disabled(app.selectedCustomerIDs.contains(customer.id))
                        }
                    }
                    .quadCard()
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("客户列表")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "搜索名称、地址、电话或联系人")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(destination: NewCustomerView()) { Label("新增", systemImage: "plus") }
            }
        }
        .task { if app.customers.isEmpty { await app.loadCustomers() } }
    }
}

struct CustomerDetailView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.openURL) private var openURL
    let customer: CustomerSummary

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: customer.customerCode,
                    title: customer.customerName,
                    subtitle: customer.customerType.isEmpty ? "客户资料" : customer.customerType,
                    badge: customer.owner.isEmpty ? nil : customer.owner
                )

                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: "联系资料", trailing: "服务器客户档案")
                    detailRow("联系人", customer.contactName.isEmpty ? "未填写" : customer.contactName, "person.fill")
                    Divider()
                    detailRow("电话", customer.phone.isEmpty ? "未填写" : customer.phone, "phone.fill")
                    Divider()
                    detailRow("邮箱", customer.email.isEmpty ? "未填写" : customer.email, "envelope.fill")
                    Divider()
                    detailRow("地址", customer.address.isEmpty ? "未填写" : customer.address, "mappin.and.ellipse")
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 12) {
                    QuadSectionHeader(title: "业务资料", trailing: customer.updatedAt.isEmpty ? "" : "最近更新 \(customer.updatedAt)")
                    LabeledContent("客户来源", value: customer.sourceChannel.isEmpty ? "未填写" : customer.sourceChannel)
                    Divider()
                    LabeledContent("主要产品", value: customer.mainProducts.isEmpty ? "未填写" : customer.mainProducts)
                    Divider()
                    LabeledContent("负责人", value: customer.owner.isEmpty ? "未分配" : customer.owner)
                }
                .quadCard()

                HStack(spacing: 10) {
                    if let phoneURL = URL(string: "tel:\(customer.phone.filter { $0.isNumber || $0 == "+" })"), !customer.phone.isEmpty {
                        Link(destination: phoneURL) { Label("拨打电话", systemImage: "phone.fill") }
                            .buttonStyle(.borderedProminent)
                    }
                    Button { openMap() } label: { Label("地图导航", systemImage: "map.fill") }
                        .buttonStyle(.bordered)
                        .disabled(customer.address.isEmpty)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("客户资料")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detailRow(_ title: String, _ value: String, _ icon: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(Color.quadTeal).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.body)
            }
            Spacer()
        }
    }

    private func openMap() {
        guard let url = app.region.mapSearchURL(query: customer.address) else {
            app.errorMessage = "地图地址无效，请检查客户地址"
            return
        }
        openURL(url)
    }
}

struct PlanCustomerSelectionView: View {
    @EnvironmentObject private var app: AppState
    @State private var visitDate = Date()
    @State private var sortMode = "默认顺序"
    @State private var search = ""
    @State private var customerPendingCancellation: CustomerSummary?

    private var selectedCustomers: [CustomerSummary] {
        app.customers.filter { app.selectedCustomerIDs.contains($0.id) }
    }

    private var selectedDistanceMiles: Double {
        selectedCustomers.reduce(0) { $0 + ($1.distanceMiles ?? 0) }
    }

    private var selectedTravelMinutes: Int {
        selectedCustomers.reduce(0) { $0 + ($1.travelMinutes ?? 0) }
    }

    private var businessTodayStart: Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = app.region.timeZone
        return calendar.startOfDay(for: Date())
    }

    private var visibleCustomers: [CustomerSummary] {
        let filtered = selectedCustomers.filter {
            search.isEmpty
                || $0.customerName.localizedCaseInsensitiveContains(search)
                || $0.address.localizedCaseInsensitiveContains(search)
                || $0.phone.localizedCaseInsensitiveContains(search)
        }
        switch sortMode {
        case "距离最近": return filtered.sorted { ($0.distanceMiles ?? .greatestFiniteMagnitude) < ($1.distanceMiles ?? .greatestFiniteMagnitude) }
        case "最近更新": return filtered.sorted { $0.updatedAt > $1.updatedAt }
        default: return filtered
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "已加入拜访计划",
                    title: app.region.formatDate(visitDate),
                    subtitle: "客户由客户列表加入；取消后退回客户列表，客户资料仍保留",
                    color: .quadPurple,
                    badge: "\(selectedCustomers.count) 位"
                )
                DatePicker("默认拜访日期", selection: $visitDate, in: businessTodayStart..., displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .environment(\.timeZone, app.region.timeZone)
                    .quadCard()

                HStack(spacing: 7) {
                    ForEach(["默认顺序", "距离最近", "最近更新"], id: \.self) { item in
                        Button(item) { sortMode = item }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(sortMode == item ? .white : .quadPurple)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(sortMode == item ? Color.quadPurple : Color.quadPurple.opacity(0.1), in: Capsule())
                    }
                    Spacer()
                }

                if selectedCustomers.isEmpty {
                    ContentUnavailableView {
                        Label("暂无计划拜访客户", systemImage: "calendar.badge.plus")
                    } description: {
                        Text("请先到客户列表点击“加入拜访计划”")
                    } actions: {
                        NavigationLink("前往客户列表") { CustomerListView() }
                            .buttonStyle(.borderedProminent)
                            .tint(.quadPurple)
                    }
                    .quadCard()
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        QuadSectionHeader(title: "待安排客户", trailing: "\(visibleCustomers.count) 位")
                        if visibleCustomers.isEmpty {
                            Text("没有符合搜索条件的计划客户")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, minHeight: 80)
                        }
                        ForEach(visibleCustomers) { customer in
                            VStack(spacing: 10) {
                                CustomerCompactCard(customer: customer) {
                                    if let distance = customer.distanceMiles {
                                        Text(app.region.formatDistance(miles: distance))
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(Color.quadPurple)
                                    }
                                }
                                HStack {
                                    Text("已在近期拜访计划中")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Button(role: .destructive) {
                                        customerPendingCancellation = customer
                                    } label: {
                                        Label("取消拜访计划", systemImage: "xmark.circle.fill")
                                            .font(.subheadline.weight(.bold))
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(.red)
                                }
                            }
                            if customer.id != visibleCustomers.last?.id { Divider() }
                        }
                    }
                    .quadCard()
                }

                HStack(spacing: 0) {
                    QuadMetric(value: "\(selectedCustomers.count)", label: "已选客户", color: .quadPurple)
                    QuadMetric(value: app.region.formatDistance(miles: selectedDistanceMiles), label: "预计里程", color: .quadPurple)
                    QuadMetric(value: "\(selectedTravelMinutes) 分钟", label: "估算车程", color: .quadPurple)
                }
                .quadCard()

                NavigationLink(destination: PlanScheduleView(
                    selectedCustomers: selectedCustomers,
                    visitDate: visitDate,
                    businessTimeZone: app.region.timeZone
                )) {
                    HStack { Text("下一步：安排顺序和时间"); Spacer(); Image(systemName: "arrow.right") }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding()
                        .background(selectedCustomers.isEmpty ? Color(uiColor: .systemGray3) : Color.quadPurple, in: RoundedRectangle(cornerRadius: 13))
                }
                .disabled(selectedCustomers.isEmpty)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("计划拜访")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "搜索计划中的客户名称、地址或电话")
        .confirmationDialog(
            "取消拜访计划？",
            isPresented: Binding(
                get: { customerPendingCancellation != nil },
                set: { if !$0 { customerPendingCancellation = nil } }
            ),
            titleVisibility: .visible,
            presenting: customerPendingCancellation
        ) { customer in
            Button("确认取消", role: .destructive) {
                app.selectedCustomerIDs.remove(customer.id)
                app.successMessage = "已取消 \(customer.customerName) 的拜访计划；客户资料仍保留在客户列表"
                customerPendingCancellation = nil
            }
            Button("暂不取消", role: .cancel) { customerPendingCancellation = nil }
        } message: { customer in
            Text("\(customer.customerName) 将从计划拜访名单移出并回到客户列表；客户资料不会删除。")
        }
        .task { if app.customers.isEmpty { await app.loadCustomers() } }
    }
}

struct PlanScheduleView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var schedules: [VisitScheduleDraft]
    @State private var startAddress = ""
    @State private var optimized = false
    @State private var showToday = false
    @State private var isSubmitting = false

    init(
        selectedCustomers: [CustomerSummary],
        visitDate: Date = Date(),
        businessTimeZone: TimeZone = .autoupdatingCurrent
    ) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = businessTimeZone
        let day = calendar.startOfDay(for: visitDate)
        let morningTime = calendar.date(bySettingHour: 9, minute: 30, second: 0, of: day) ?? day
        let nextAvailableTime = Date().addingTimeInterval(15 * 60)
        let firstTime = morningTime > nextAvailableTime ? morningTime : nextAvailableTime
        _schedules = State(initialValue: selectedCustomers.enumerated().map { index, customer in
            VisitScheduleDraft(
                customer: customer,
                scheduledAt: firstTime.addingTimeInterval(Double(index) * 4_200),
                sequence: index + 1
            )
        })
    }

    private var totalDistanceMiles: Double {
        schedules.reduce(0) { $0 + ($1.customer.distanceMiles ?? 0) }
    }
    private var totalTravelMinutes: Int {
        schedules.reduce(0) { $0 + ($1.customer.travelMinutes ?? 0) }
    }
    private var plannedDays: [Date] {
        Array(Set(schedules.map { dayStart(for: $0.scheduledAt) })).sorted()
    }
    private var dateRangeTitle: String {
        guard let first = plannedDays.first, let last = plannedDays.last else { return "尚未安排" }
        if first == last { return app.region.formatDate(first) }
        return "\(shortDate(first)) – \(shortDate(last))"
    }
    private var latestTime: String {
        schedules.map(\.scheduledAt).max().map(timeText) ?? "—"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: plannedDays.count > 1 ? "跨 \(plannedDays.count) 天拜访计划" : "拜访计划",
                    title: dateRangeTitle,
                    subtitle: "每位客户可单独设置日期和时间",
                    color: .quadPurple,
                    badge: "\(schedules.count) 位客户"
                )
                VStack(alignment: .leading, spacing: 10) {
                    Text("出发地点 · 可选择或输入").font(.caption).foregroundStyle(.secondary)
                    TextField("出发地点", text: $startAddress).textFieldStyle(.roundedBorder)
                }
                .quadCard()

                Button {
                    optimizeEachDayByDistance()
                    optimized = true
                } label: {
                    HStack {
                        Image(systemName: "sparkles")
                        VStack(alignment: .leading) {
                            Text("按距离估算优化每天顺序").font(.headline)
                            Text("使用客户距离在每一天内重新分配时间顺序；优化后仍可逐客修改").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(optimized ? "已优化" : "重新优化").font(.caption.weight(.semibold)).foregroundStyle(Color.quadPurple)
                    }
                    .quadCard()
                }
                .buttonStyle(.plain)

                ForEach(plannedDays, id: \.self) { day in
                    let daySchedules = schedulesForDay(day)
                    VStack(alignment: .leading, spacing: 12) {
                        QuadSectionHeader(
                            title: app.region.formatDate(day),
                            trailing: "\(daySchedules.count) 位 · 按时间排序"
                        )
                        ForEach(Array(daySchedules.enumerated()), id: \.element.id) { index, schedule in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(spacing: 10) {
                                    Text("\(index + 1)").font(.headline).foregroundStyle(.white)
                                        .frame(width: 30, height: 30).background(Color.quadPurple, in: Circle())
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(schedule.customer.customerName).font(.headline)
                                        Text("\(app.region.formatDistance(miles: schedule.customer.distanceMiles ?? 0)) · 预计车程 \(schedule.customer.travelMinutes ?? 0) 分钟")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(spacing: 4) {
                                        Button { move(schedule.id, by: -1) } label: { Image(systemName: "chevron.up") }
                                            .disabled(index == 0)
                                        Button { move(schedule.id, by: 1) } label: { Image(systemName: "chevron.down") }
                                            .disabled(index == daySchedules.count - 1)
                                    }
                                    .buttonStyle(.borderless)
                                }
                                DatePicker(
                                    "独立拜访时间",
                                    selection: scheduleBinding(for: schedule.id),
                                    in: Date()...,
                                    displayedComponents: [.date, .hourAndMinute]
                                )
                                .datePickerStyle(.compact)
                                .font(.subheadline.weight(.semibold))
                                Divider()
                                Button(role: .destructive) {
                                    removeSchedule(schedule.id)
                                } label: {
                                    Label("取消拜访计划", systemImage: "xmark.circle.fill")
                                        .font(.subheadline.weight(.bold))
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .tint(.red)
                            }
                            if index < daySchedules.count - 1 { Divider() }
                        }
                    }
                    .quadCard()
                }

                HStack(spacing: 0) {
                    QuadMetric(value: "\(plannedDays.count) 天", label: "计划跨度", color: .quadPurple)
                    QuadMetric(value: "\(totalTravelMinutes) 分钟", label: "估算车程", color: .quadPurple)
                    QuadMetric(value: latestTime, label: "最后一站", color: .quadPurple)
                }
                .quadCard()

                QuadPrimaryButton(title: (isSubmitting || app.isSavingVisitPlans) ? "正在保存计划…" : "确认并保存 \(schedules.count) 项计划", systemImage: "checkmark", color: .quadPurple, isEnabled: !isSubmitting && !app.isSavingVisitPlans && !schedules.isEmpty) {
                    guard !isSubmitting else { return }
                    isSubmitting = true
                    Task {
                        normalizeSequences()
                        let containsToday = schedules.contains { dayStart(for: $0.scheduledAt) == dayStart(for: Date()) }
                        if await app.confirmVisitPlans(schedules: schedules) {
                            if containsToday { showToday = true }
                            else { dismiss() }
                        } else {
                            isSubmitting = false
                        }
                    }
                }
                Text("保存后，当天计划会立即进入“今日拜访”；未来日期会保留在计划中，到当天自动出现。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("安排顺序和时间")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if startAddress.isEmpty { startAddress = app.region.defaultStartAddress }
        }
        .navigationDestination(isPresented: $showToday) {
            TodayVisitsView()
        }
    }

    private func dayStart(for date: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = app.region.timeZone
        return calendar.startOfDay(for: date)
    }

    private func shortDate(_ date: Date) -> String {
        return date.formatted(
            Date.FormatStyle(date: .abbreviated, time: .omitted, locale: app.region.locale, timeZone: app.region.timeZone)
        )
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle(date: .omitted, time: .shortened, locale: app.region.locale, timeZone: app.region.timeZone)
        )
    }

    private func schedulesForDay(_ day: Date) -> [VisitScheduleDraft] {
        schedules
            .filter { dayStart(for: $0.scheduledAt) == day }
            .sorted {
                if $0.scheduledAt != $1.scheduledAt { return $0.scheduledAt < $1.scheduledAt }
                return $0.sequence < $1.sequence
            }
    }

    private func scheduleBinding(for id: String) -> Binding<Date> {
        Binding(
            get: { schedules.first(where: { $0.id == id })?.scheduledAt ?? Date() },
            set: { newValue in
                guard let index = schedules.firstIndex(where: { $0.id == id }) else { return }
                schedules[index].scheduledAt = newValue
                optimized = false
                normalizeSequences()
            }
        )
    }

    private func normalizeSequences() {
        for day in plannedDays {
            for (index, schedule) in schedulesForDay(day).enumerated() {
                guard let source = schedules.firstIndex(where: { $0.id == schedule.id }) else { continue }
                schedules[source].sequence = index + 1
            }
        }
    }

    private func move(_ id: String, by offset: Int) {
        guard let source = schedules.first(where: { $0.id == id }) else { return }
        let daySchedules = schedulesForDay(dayStart(for: source.scheduledAt))
        guard let index = daySchedules.firstIndex(where: { $0.id == id }) else { return }
        let target = index + offset
        guard daySchedules.indices.contains(target),
              let sourceIndex = schedules.firstIndex(where: { $0.id == id }),
              let targetIndex = schedules.firstIndex(where: { $0.id == daySchedules[target].id }) else { return }
        let sourceTime = schedules[sourceIndex].scheduledAt
        schedules[sourceIndex].scheduledAt = schedules[targetIndex].scheduledAt
        schedules[targetIndex].scheduledAt = sourceTime
        optimized = false
        normalizeSequences()
    }

    private func removeSchedule(_ id: String) {
        guard let schedule = schedules.first(where: { $0.id == id }) else { return }
        schedules.removeAll { $0.id == id }
        app.selectedCustomerIDs.remove(schedule.customer.id)
        optimized = false
        normalizeSequences()
        app.successMessage = "已取消 \(schedule.customer.customerName) 的拜访计划；客户资料仍保留在客户列表"
    }

    private func optimizeEachDayByDistance() {
        for day in plannedDays {
            let daySchedules = schedulesForDay(day)
            let timeSlots = daySchedules.map(\.scheduledAt).sorted()
            let byDistance = daySchedules.sorted {
                let lhs = $0.customer.distanceMiles ?? .greatestFiniteMagnitude
                let rhs = $1.customer.distanceMiles ?? .greatestFiniteMagnitude
                if lhs != rhs { return lhs < rhs }
                return $0.scheduledAt < $1.scheduledAt
            }
            for (index, schedule) in byDistance.enumerated() {
                guard let source = schedules.firstIndex(where: { $0.id == schedule.id }) else { continue }
                schedules[source].scheduledAt = timeSlots[index]
                schedules[source].sequence = index + 1
            }
        }
    }
}

struct TodayVisitsView: View {
    @EnvironmentObject private var app: AppState
    @State private var selectedDate = Date()
    @State private var selectedDashboard: FieldDashboard?
    @State private var isLoadingDate = false
    @State private var planPendingDeletion: VisitPlan?

    private var selectedDateKey: String {
        APIClient.localDate(selectedDate, timeZoneIdentifier: app.region.timeZoneIdentifier)
    }
    private var todayKey: String {
        APIClient.localDate(timeZoneIdentifier: app.region.timeZoneIdentifier)
    }
    private var isToday: Bool { selectedDateKey == todayKey }
    private var isFuture: Bool { selectedDateKey > todayKey }
    private var plans: [VisitPlan] { selectedDashboard?.todayCustomers ?? (isToday ? app.activePlans : []) }
    private var nextPlan: VisitPlan? { plans.first(where: { $0.status != "COMPLETED" }) }
    private func distanceMiles(for plan: VisitPlan) -> Double {
        app.customers.first(where: { $0.customerId == plan.customerId })?.distanceMiles ?? 0
    }
    private func customer(for plan: VisitPlan) -> CustomerSummary? {
        app.customers.first(where: { $0.customerId == plan.customerId })
    }
    private func isPendingSync(_ plan: VisitPlan) -> Bool { plan.planId.hasPrefix("local-") }
    private func canDelete(_ plan: VisitPlan) -> Bool {
        ["PLANNED", "PENDING", "SCHEDULED"].contains(plan.status.uppercased())
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Label("查看拜访日期", systemImage: "calendar")
                            .font(.headline)
                        Spacer()
                        if isLoadingDate { ProgressView() }
                        if !isToday {
                            Button("回到今天") { selectedDate = Date() }
                                .buttonStyle(.bordered)
                        }
                    }
                    DatePicker(
                        "查看日期",
                        selection: $selectedDate,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    .environment(\.timeZone, app.region.timeZone)
                    Text(isToday
                         ? "正在显示今天的拜访安排"
                         : isFuture
                            ? "正在查看 \(app.region.formatDate(selectedDate)) 的未来拜访计划"
                            : "正在查看 \(app.region.formatDate(selectedDate)) 的历史拜访")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 12) {
                    Text(isToday ? "今天的行程" : isFuture ? "未来拜访计划" : "历史拜访行程")
                        .font(.title2.weight(.bold))
                    Text(app.region.formatDate(selectedDate)).font(.subheadline).foregroundStyle(.secondary)
                    HStack(spacing: 0) {
                        QuadMetric(value: "\(plans.count)", label: "计划拜访")
                        QuadMetric(value: "\(plans.filter { $0.status == "COMPLETED" }.count)", label: "已经完成")
                        QuadMetric(value: "\(plans.filter { $0.status != "COMPLETED" }.count)", label: "等待拜访")
                    }
                }
                .quadCard()

                if let nextPlan {
                    QuadHero(
                        kicker: "下一位客户",
                        title: nextPlan.customerName,
                        subtitle: nextPlan.address ?? "尚未填写地址",
                        badge: nextPlan.scheduledAt.map(app.region.formatTime) ?? "待安排",
                        metrics: [("距离", app.region.formatDistance(miles: distanceMiles(for: nextPlan))), ("计划顺序", nextPlan.routeSequence.map { String(Int($0)) } ?? "待排"), ("状态", nextPlan.status)]
                    )
                    HStack {
                        if let customer = customer(for: nextPlan) {
                            NavigationLink("查看资料") { CustomerDetailView(customer: customer) }
                                .buttonStyle(.bordered)
                        }
                        if isPendingSync(nextPlan) {
                            Label("已保存到手机 · 正在同步", systemImage: "arrow.triangle.2.circlepath")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        } else {
                            NavigationLink(destination: VisitExecutionView(plan: nextPlan)) {
                                Label("准备出发", systemImage: "location.fill")
                            }
                            .buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }
                    .quadCard()
                } else if plans.isEmpty {
                    ContentUnavailableView(
                        isToday ? "今天没有待执行拜访" : "这一天没有拜访记录",
                        systemImage: "calendar.badge.checkmark",
                        description: Text(isToday ? "请在计划拜访中选择客户并安排日期" : "可以选择其他日期继续查看")
                    )
                    .quadCard()
                } else {
                    ContentUnavailableView("今日拜访已完成", systemImage: "checkmark.circle.fill")
                        .quadCard()
                }

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(
                        title: isToday ? "今日拜访顺序" : isFuture ? "未来拜访计划" : "当日拜访记录",
                        trailing: "按计划时间"
                    )
                    ForEach(Array(plans.enumerated()), id: \.element.id) { index, plan in
                        VStack(alignment: .leading, spacing: 10) {
                            if isPendingSync(plan) {
                                VStack(alignment: .leading, spacing: 6) {
                                    VisitPlanRow(plan: plan, sequence: index + 1, isCompleted: false)
                                    Label("手机已保存，正在同步总系统", systemImage: "arrow.triangle.2.circlepath")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                            } else {
                                NavigationLink(destination: VisitExecutionView(plan: plan)) {
                                    VisitPlanRow(plan: plan, sequence: index + 1, isCompleted: plan.status == "COMPLETED")
                                }
                                .buttonStyle(.plain)
                            }
                            if canDelete(plan) {
                                Divider()
                                Button(role: .destructive) {
                                    planPendingDeletion = plan
                                } label: {
                                    Label("取消拜访计划", systemImage: "xmark.circle.fill")
                                        .font(.subheadline.weight(.bold))
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .tint(.red)
                            }
                        }
                        if index < plans.count - 1 { Divider() }
                    }
                }
                .quadCard()
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("拜访记录")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await app.refreshBusinessData()
            await loadSelectedDate()
        }
        .task(id: selectedDateKey) {
            if app.customers.isEmpty { await app.loadCustomers() }
            await loadSelectedDate()
        }
        .alert(
            "取消拜访计划？",
            isPresented: Binding(
                get: { planPendingDeletion != nil },
                set: { if !$0 { planPendingDeletion = nil } }
            ),
            presenting: planPendingDeletion
        ) { plan in
            Button("暂不取消", role: .cancel) { planPendingDeletion = nil }
            Button("确认取消", role: .destructive) {
                planPendingDeletion = nil
                removeCancelledPlanFromScreen(plan)
                Task {
                    if !(await app.deleteVisitPlan(plan)) {
                        await loadSelectedDate()
                    }
                }
            }
        } message: { plan in
            Text("“\(plan.customerName)”将从拜访计划中消失；只取消这次安排，客户资料仍会保留。")
        }
    }

    private func loadSelectedDate() async {
        isLoadingDate = true
        defer { isLoadingDate = false }
        do {
            selectedDashboard = try await app.dashboard(for: selectedDate)
        } catch {
            selectedDashboard = nil
            app.errorMessage = "拜访日期读取失败：\(error.localizedDescription)"
        }
    }

    private func removeCancelledPlanFromScreen(_ plan: VisitPlan) {
        guard let current = selectedDashboard else { return }
        selectedDashboard = FieldDashboard(
            workDate: current.workDate,
            trackingIntervalSeconds: current.trackingIntervalSeconds,
            activeShift: current.activeShift,
            shifts: current.shifts,
            todayCustomers: current.todayCustomers.filter { $0.planId != plan.planId },
            route: current.route
        )
    }
}

struct DailyReportView: View {
    @EnvironmentObject private var app: AppState
    @State private var notes = ""
    @State private var aiSummary = ""

    private var reportRows: [(String, String, String, String)] {
        let plans = app.activePlans
        let completed = plans.filter { $0.status == "COMPLETED" }.count
        let pending = max(0, plans.count - completed)
        let locationCount = app.dashboard?.route.count ?? 0
        let shiftCount = app.dashboard?.shifts.count ?? 0
        return [
            ("person.2.fill", "客户拜访", "今天的服务器拜访计划", "\(completed) / \(plans.count) 完成"),
            ("calendar.badge.clock", "待执行计划", "尚未标记完成的拜访", "\(pending) 项"),
            ("location.fill", "定位轨迹", "本机已同步到当前看板的定位点", "\(locationCount) 点"),
            ("clock.fill", "考勤班次", "当前工作日服务器班次记录", "\(shiftCount) 段")
        ]
    }

    private var generatedSummary: String {
        let plans = app.activePlans
        let completed = plans.filter { $0.status == "COMPLETED" }
        let pending = plans.filter { $0.status != "COMPLETED" }
        let completedNames = completed.map(\.customerName).joined(separator: "、")
        let pendingNames = pending.map(\.customerName).joined(separator: "、")
        var parts = ["今日共有 \(plans.count) 项客户拜访计划，已完成 \(completed.count) 项，待执行 \(pending.count) 项。"]
        if !completedNames.isEmpty { parts.append("已完成客户：\(completedNames)。") }
        if !pendingNames.isEmpty { parts.append("后续待办客户：\(pendingNames)。") }
        if plans.isEmpty { parts = ["今天服务器尚未返回拜访计划。请补充实际工作内容后再提交日报。"] }
        return parts.joined(separator: "\n")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "今日工作总结",
                    title: app.region.formatDate(Date()),
                    subtitle: app.user?.displayName ?? "业务员",
                    color: .quadGreen,
                    badge: "待提交",
                    metrics: [("完成拜访", "\(app.activePlans.filter { $0.status == "COMPLETED" }.count) / \(app.activePlans.count)"), ("定位点", "\(app.dashboard?.route.count ?? 0)"), ("班次", "\(app.dashboard?.shifts.count ?? 0)")]
                )
                VStack(alignment: .leading, spacing: 13) {
                    QuadSectionHeader(title: "系统自动汇总", trailing: "来自正式业务记录")
                    ForEach(reportRows, id: \.1) { item in
                        HStack(spacing: 11) {
                            Image(systemName: item.0).foregroundStyle(Color.quadGreen).frame(width: 26)
                            VStack(alignment: .leading) { Text(item.1).font(.subheadline.weight(.semibold)); Text(item.2).font(.caption).foregroundStyle(.secondary) }
                            Spacer(); Text(item.3).font(.caption.weight(.bold)).foregroundStyle(Color.quadGreen)
                        }
                        Divider()
                    }
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(title: "AI 工作总结", trailing: "可修改")
                    TextEditor(text: $aiSummary).frame(minHeight: 150)
                    HStack {
                        Button("重新生成", systemImage: "sparkles") {
                            aiSummary = generatedSummary
                            app.successMessage = "已根据当前服务器记录重新整理"
                        }
                    }
                    .buttonStyle(.bordered)
                }
                .quadCard()

                VStack(alignment: .leading, spacing: 10) {
                    QuadSectionHeader(title: "人工补充", trailing: "选填")
                    TextEditor(text: $notes).frame(minHeight: 110)
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color(uiColor: .separator)) }
                }
                .quadCard()

                QuadPrimaryButton(title: app.isBusy ? "正在提交…" : "确认并提交今日工作日报", systemImage: "paperplane.fill", color: .quadGreen, isEnabled: !app.isBusy) {
                    Task { _ = await app.submitDailyReport(notes: aiSummary + "\n\n人工补充：" + notes) }
                }
                Text("所有数字来自当天正式业务记录，AI 只负责整理总结。")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("工作日报")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if aiSummary.isEmpty {
                aiSummary = generatedSummary
            }
        }
    }
}

private enum NearbyMatchSource: Int, Comparable {
    case deviceLocation = 0
    case serverDistance = 1
    case addressCity = 2

    static func < (lhs: NearbyMatchSource, rhs: NearbyMatchSource) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

private struct NearbyCustomerMatch: Identifiable {
    let customer: CustomerSummary
    let distanceMiles: Double?
    let source: NearbyMatchSource

    var id: String { customer.id }
}

private enum NearbyCityMatcher {
    static func normalized(_ value: String) -> String {
        var result = value.lowercased()
        for token in ["特别行政区", "壮族自治区", "回族自治区", "维吾尔自治区", "自治区", "省", "市"] {
            result = result.replacingOccurrences(of: token, with: "")
        }
        return result.components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }

    static func address(_ address: String, matches city: String) -> Bool {
        let query = normalized(city)
        guard !query.isEmpty else { return false }
        return normalized(address).contains(query)
    }
}

struct NearbyCustomersView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.openURL) private var openURL
    @State private var radiusMiles = 10.0
    @State private var selected: Set<String> = []
    @State private var cityDraft = ""
    @State private var appliedCity = ""
    @State private var locatedCity = ""
    @State private var currentLocation: CLLocation?
    @State private var locationUpdatedAt: Date?
    @State private var isLocating = false
    @State private var locationMessage = "尚未读取手机位置"
    @State private var customerType = "全部类型"
    @FocusState private var isCityFieldFocused: Bool

    private var effectiveCity: String {
        let manual = appliedCity.trimmingCharacters(in: .whitespacesAndNewlines)
        return manual.isEmpty ? locatedCity : manual
    }

    private var matches: [NearbyCustomerMatch] {
        let isManualCity = !appliedCity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return app.customers.compactMap { customer in
            guard customerType == "全部类型" || customer.customerType == customerType else { return nil }
            let cityMatches = NearbyCityMatcher.address(customer.address, matches: effectiveCity)

            if isManualCity {
                guard cityMatches else { return nil }
                // A typed city can be different from the phone's current city.
                                // Do not compare a remote-city customer with the current phone location.
                return NearbyCustomerMatch(customer: customer, distanceMiles: nil, source: .addressCity)
            }

            if let currentLocation,
               let latitude = customer.latitude,
               let longitude = customer.longitude {
                let customerLocation = CLLocation(latitude: latitude, longitude: longitude)
                let miles = currentLocation.distance(from: customerLocation) / 1_609.344
                guard miles <= radiusMiles else { return nil }
                return NearbyCustomerMatch(customer: customer, distanceMiles: miles, source: .deviceLocation)
            }

            if let miles = customer.distanceMiles, miles <= radiusMiles {
                return NearbyCustomerMatch(customer: customer, distanceMiles: miles, source: .serverDistance)
            }

            guard !effectiveCity.isEmpty, cityMatches else { return nil }
            return NearbyCustomerMatch(customer: customer, distanceMiles: nil, source: .addressCity)
        }
        .sorted {
            if $0.source != $1.source { return $0.source < $1.source }
            if let left = $0.distanceMiles, let right = $1.distanceMiles, left != right { return left < right }
            return $0.customer.customerName.localizedStandardCompare($1.customer.customerName) == .orderedAscending
        }
    }

    private var customerTypes: [String] {
        ["全部类型"] + Array(Set(app.customers.map(\.customerType).filter { !$0.isEmpty })).sorted()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                QuadHero(
                    kicker: "当前位置周边客户",
                    title: effectiveCity.isEmpty ? "当前位置" : effectiveCity,
                    subtitle: locationMessage,
                    color: .quadRose,
                    badge: isLocating ? "定位中…" : "更新位置",
                    badgeAction: { Task { await refreshLocation() } },
                    metrics: locationMetrics
                )
                VStack(alignment: .leading, spacing: 10) {
                    Text("也可以按城市查询").font(.headline)
                    HStack {
                        TextField("例如：九江或九江市", text: $cityDraft)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.search)
                            .focused($isCityFieldFocused)
                            .onSubmit(applyManualCity)
                        Button("确认查询", action: applyManualCity)
                            .buttonStyle(.borderedProminent)
                            .disabled(cityDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    if !appliedCity.isEmpty {
                        HStack {
                            Label("正在按“\(appliedCity)”匹配客户档案地址", systemImage: "checkmark.circle.fill")
                                .font(.caption).foregroundStyle(Color.quadTeal)
                            Spacer()
                            Button("改用手机定位") {
                                appliedCity = ""
                                cityDraft = ""
                                Task { await refreshLocation() }
                            }
                            .font(.caption)
                        }
                    }
                }
                .quadCard()
                HStack {
                    Menu(app.region.formatDistance(miles: radiusMiles, fractionDigits: 0) + "内") {
                        ForEach(app.region.distanceFilterOptionsMiles, id: \.miles) { option in
                            Button(option.label) { radiusMiles = option.miles }
                        }
                    }
                    .buttonStyle(.bordered)
                    Menu(customerType) {
                        ForEach(customerTypes, id: \.self) { type in Button(type) { customerType = type } }
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "附近客户", trailing: matchSummary)
                    if matches.isEmpty {
                        ContentUnavailableView(
                            "范围内没有客户",
                            systemImage: "mappin.slash",
                            description: Text(emptyStateMessage)
                        )
                    }
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, match in
                        let customer = match.customer
                        VStack(spacing: 12) {
                            CustomerCompactCard(customer: customer, rank: index + 1, color: .quadRose) {
                                VStack(alignment: .trailing) {
                                    Text(distanceLabel(for: match))
                                        .font(.subheadline.weight(.bold)).foregroundStyle(Color.quadRose)
                                    Text(distanceDetail(for: match))
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            HStack {
                                NavigationLink("查看资料") { CustomerDetailView(customer: customer) }
                                    .buttonStyle(.bordered)
                                Spacer()
                                Button(selected.contains(customer.id) ? "已加入计划" : "加入拜访计划") {
                                    if selected.contains(customer.id) { selected.remove(customer.id) } else { selected.insert(customer.id) }
                                }
                                .buttonStyle(.borderedProminent).tint(.quadRose)
                            }
                        }
                        if index < matches.count - 1 { Divider() }
                    }
                }
                .quadCard()

                if !selected.isEmpty {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("已选择 \(selected.count) 家附近客户").font(.headline)
                            let selectedMatches = matches.filter { selected.contains($0.id) }
                            let knownMiles = selectedMatches.compactMap(\.distanceMiles).reduce(0, +)
                            Text(knownMiles > 0 ? "已知距离合计 \(app.region.formatDistance(miles: knownMiles))" : "距离将在客户坐标建档后计算")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        NavigationLink("安排拜访") {
                            PlanScheduleView(selectedCustomers: matches.map(\.customer).filter { selected.contains($0.id) })
                        }
                        .buttonStyle(.borderedProminent).tint(.quadRose)
                    }
                    .quadCard()
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("附近客户")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(app.region.mapProvider.displayName) {
                    let query = effectiveCity.isEmpty ? currentCoordinateText : effectiveCity
                    if let url = app.region.mapSearchURL(query: query) {
                        openURL(url)
                    } else {
                        app.errorMessage = "地图地址无效，请检查当前地区配置"
                    }
                }
            }
        }
        .task {
            if app.customers.isEmpty { await app.loadCustomers() }
            if app.isDesignPreview, ProcessInfo.processInfo.arguments.contains("-preview-nearby-jiujiang") {
                cityDraft = "九江市"
                appliedCity = "九江市"
                locationMessage = "手动城市已确认 · 地址匹配结果来自客户总系统"
            } else if currentLocation == nil, appliedCity.isEmpty {
                await refreshLocation()
            }
        }
        .refreshable { await refreshLocation() }
    }

    private var locationMetrics: [(String, String)] {
        guard let currentLocation else {
            return [("手机定位", isLocating ? "正在读取" : "未读取"), ("客户总数", "\(app.customers.count)")]
        }
        let accuracy = max(0, Int(currentLocation.horizontalAccuracy.rounded()))
        return [
            ("当前位置", currentCoordinateText),
            ("定位精度", "约 \(accuracy) 米"),
            ("更新时间", locationUpdatedAt?.formatted(date: .omitted, time: .shortened) ?? "刚刚")
        ]
    }

    private var currentCoordinateText: String {
        guard let currentLocation else { return "" }
        return String(format: "%.5f, %.5f", currentLocation.coordinate.latitude, currentLocation.coordinate.longitude)
    }

    private var matchSummary: String {
        let exact = matches.filter { $0.source != .addressCity }.count
        let city = matches.count - exact
        if city > 0, exact > 0 { return "\(exact) 家有距离 · \(city) 家同城" }
        if city > 0 { return "\(city) 家客户地址匹配" }
        return "\(exact) 家在距离范围内"
    }

    private var emptyStateMessage: String {
        if app.customers.isEmpty { return "客户总系统尚未返回数据，请先下拉刷新或检查登录网络" }
        if effectiveCity.isEmpty, currentLocation == nil { return "请点击“更新位置”读取手机定位，或输入城市后点“确认查询”" }
        return "已检查 \(app.customers.count) 条客户档案；请扩大距离、切换客户类型或修改城市"
    }

    private func distanceLabel(for match: NearbyCustomerMatch) -> String {
        guard let miles = match.distanceMiles else { return "同城客户" }
        return app.region.formatDistance(miles: miles)
    }

    private func distanceDetail(for match: NearbyCustomerMatch) -> String {
        switch match.source {
        case .deviceLocation:
            return "按手机综合定位计算"
        case .serverDistance:
            if let minutes = match.customer.travelMinutes { return "服务器距离 · 约 \(minutes) 分钟" }
            return "服务器距离"
        case .addressCity:
            return "地址匹配 · 距离待建档"
        }
    }

    private func applyManualCity() {
        let value = cityDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        appliedCity = value
        locationMessage = "手动城市已确认 · 地址匹配结果来自客户总系统"
        isCityFieldFocused = false
    }

    @MainActor
    private func refreshLocation() async {
        guard !isLocating else { return }
        isLocating = true
        locationMessage = "正在读取手机综合定位…"
        defer { isLocating = false }
        do {
            let location = try await app.location.currentSystemLocation(for: .nearbyCustomers)
            currentLocation = location
            locationUpdatedAt = Date()
            appliedCity = ""
            cityDraft = ""
            do {
                let placemarks = try await CLGeocoder().reverseGeocodeLocation(
                    location,
                    preferredLocale: Locale(identifier: "zh_CN")
                )
                let placemark = placemarks.first
                locatedCity = placemark?.locality ?? placemark?.subAdministrativeArea ?? ""
                let accuracy = max(0, Int(location.horizontalAccuracy.rounded()))
                locationMessage = locatedCity.isEmpty
                    ? "手机位置已更新 · 精度约 \(accuracy) 米"
                    : "手机位置已更新到 \(locatedCity) · 精度约 \(accuracy) 米"
            } catch {
                locatedCity = ""
                locationMessage = "手机位置已更新；城市解析暂不可用，可手动输入城市查询"
            }
        } catch {
            locationMessage = error.localizedDescription
            app.errorMessage = "附近客户定位失败：\(error.localizedDescription)"
        }
    }
}

private struct CustomerScanResult: Sendable {
    let companyName: String
    let address: String
    let contactName: String
    let contactTitle: String
    let phone: String
    let email: String
}

private enum CustomerTextRecognizer {
    nonisolated static func recognize(_ data: Data) async throws -> CustomerScanResult {
        try await Task.detached(priority: .userInitiated) {
            guard let image = UIImage(data: data)?.cgImage else { throw APIError.message("照片无法读取") }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["zh-Hans", "en-US"]
            try VNImageRequestHandler(cgImage: image).perform([request])
            let lines = (request.results ?? [])
                .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return parse(lines: lines)
        }.value
    }

    nonisolated static func parse(lines: [String]) -> CustomerScanResult {
        let emailLine = lines.first { $0.contains("@") } ?? ""
        let email = firstMatch(in: emailLine, pattern: #"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#, caseInsensitive: true)
        let prioritizedPhoneLines = lines.sorted { phonePriority($0) > phonePriority($1) }
        let phone = prioritizedPhoneLines.lazy
            .map { firstMatch(in: $0, pattern: #"(?:\+?86[- ]?)?1[3-9][0-9][0-9 -]{8,12}"#) }
            .first { !$0.isEmpty } ?? ""
        let companyKeywords = ["有限公司", "有限责任公司", "集团", "公司", "科技", "实业", "商贸", "工厂", "门店", "中心", "商行", "co.,", "company", "ltd"]
        let companyName = lines.first { line in
            companyKeywords.contains { line.lowercased().contains($0) }
        } ?? lines.first { line in
            line.count > 4 && !line.contains("@")
                && line.range(of: #"\+?[0-9][0-9() -]{7,}"#, options: .regularExpression) == nil
        } ?? ""
        let address = lines.first { line in
            guard line != companyName else { return false }
            let lowercased = line.lowercased()
            let hasRegion = ["省", "市", "区", "县"].contains { lowercased.contains($0) }
            let hasStreet = ["镇", "乡", "村", "街道", "路", "街", "巷", "号"].contains { lowercased.contains($0) }
            let hasEnglishAddress = ["street", "road", "avenue", "boulevard"].contains { lowercased.contains($0) }
            return (hasRegion && hasStreet) || hasEnglishAddress
        } ?? ""
        let titleKeywords = ["副董事长", "董事长", "副总经理", "总经理", "经理", "总监", "总裁", "负责人", "采购", "销售", "工程师", "director", "manager", "president", "ceo"]
        let contactTitleLine = lines.first { line in
            titleKeywords.contains { line.lowercased().contains($0) }
        } ?? ""
        let contactTitle = titleKeywords.first { contactTitleLine.lowercased().contains($0) } ?? contactTitleLine
        let labelledName = lines.lazy
            .map { valueAfterLabel(in: $0, labels: ["联系人", "姓名", "name"]) }
            .first { !$0.isEmpty } ?? ""
        let excluded = Set([emailLine, address, companyName, contactTitleLine].filter { !$0.isEmpty })
        let standaloneName = lines.first { line in
            !excluded.contains(line)
                && line.range(of: #"^[\p{Han}·]{2,6}$"#, options: .regularExpression) != nil
                && !titleKeywords.contains(where: { line.contains($0) })
        } ?? ""
        let nameBesideTitle = contactTitleLine
            .replacingOccurrences(of: contactTitle, with: "", options: .caseInsensitive)
            .trimmingCharacters(in: CharacterSet(charactersIn: "：:·|/ -"))
        let contactName = !labelledName.isEmpty
            ? labelledName
            : (nameBesideTitle.range(of: #"^[\p{Han}·]{2,6}$"#, options: .regularExpression) != nil
                ? nameBesideTitle
                : standaloneName)
        return CustomerScanResult(
            companyName: companyName,
            address: address,
            contactName: contactName,
            contactTitle: contactTitle,
            phone: phone,
            email: email
        )
    }

    nonisolated private static func phonePriority(_ line: String) -> Int {
        ["手机", "电话", "联系", "mobile", "tel"].contains { line.lowercased().contains($0) } ? 1 : 0
    }

    nonisolated private static func firstMatch(in value: String, pattern: String, caseInsensitive: Bool = false) -> String {
        let options: String.CompareOptions = caseInsensitive ? [.regularExpression, .caseInsensitive] : .regularExpression
        guard let range = value.range(of: pattern, options: options) else { return "" }
        return String(value[range]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    nonisolated private static func valueAfterLabel(in line: String, labels: [String]) -> String {
        guard let label = labels.first(where: { line.range(of: $0, options: .caseInsensitive) != nil }),
              let range = line.range(of: label, options: .caseInsensitive) else { return "" }
        return String(line[range.upperBound...])
            .trimmingCharacters(in: CharacterSet(charactersIn: "：: "))
    }
}
