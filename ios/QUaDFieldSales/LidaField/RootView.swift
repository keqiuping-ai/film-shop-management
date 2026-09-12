import SwiftUI
import PhotosUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        Group {
            if app.isAuthenticated {
                if app.isDesignPreview && !app.showsAppShellPreview { DesignPreviewRouter(page: app.previewPage) }
                else { MainAppShellView() }
            } else {
                LoginView()
            }
        }
        .environment(\.locale, app.interfaceLanguage.locale)
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 0) {
                AppVersionNoticeView()
                if !app.successMessage.isEmpty {
                    SuccessNoticeView(message: app.successMessage)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .alert("提示", isPresented: Binding(
            get: { !app.errorMessage.isEmpty },
            set: { if !$0 { app.errorMessage = "" } }
        )) { Button("知道了", role: .cancel) {} } message: { Text(app.errorMessage) }
        .animation(.easeInOut(duration: 0.2), value: app.successMessage)
    }
}

private struct SuccessNoticeView: View {
    @EnvironmentObject private var app: AppState
    let message: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.quadGreen)
            Text(message)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("关闭", systemImage: "xmark") { app.successMessage = "" }
                .labelStyle(.iconOnly)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
        .task(id: message) {
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
            if app.successMessage == message { app.successMessage = "" }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var app: AppState
    @State private var account = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("QUaD GROUP")
                            .font(.caption.weight(.bold)).tracking(1.5)
                            .foregroundStyle(Color.quadTeal)
                        Text("QUaD Field Sales").font(.largeTitle.weight(.bold))
                        Text("信息 · 业务 · 我的")
                            .font(.title3).foregroundStyle(.secondary)
                    }
                    .padding(.top, 36)

                    VStack(spacing: 14) {
                        TextField("员工邮箱", text: $account)
                            .textInputAutocapitalization(.never).textContentType(.username)
                        SecureField("密码", text: $password).textContentType(.password)
                    }
                    .textFieldStyle(.roundedBorder)
                    .quadCard()

                    QuadPrimaryButton(
                        title: app.isBusy ? "登录中…" : "登录",
                        systemImage: "arrow.right",
                        isEnabled: !app.isBusy && !account.isEmpty && !password.isEmpty
                    ) {
                        Task {
                            await app.login(account: account, password: password)
                            password = ""
                        }
                    }
                    Label("密码不会以明文保存在 App 内", systemImage: "lock.shield.fill")
                        .font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
                .padding(22)
            }
            .quadScreen()
            .navigationTitle("员工登录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    InterfaceLanguageMenu()
                }
            }
        }
    }
}

struct MainAppShellView: View {
    @EnvironmentObject private var app: AppState
    @State private var showsProfileSettingsPreview = ProcessInfo.processInfo.arguments.contains("-preview-profile-settings")
    @State private var selectedTab: MainAppTab = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-preview-tab"),
              arguments.indices.contains(index + 1) else { return .business }
        return MainAppTab(rawValue: arguments[index + 1]) ?? .business
    }()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { MessageCenterView() }
                .tabItem { Label("信息", systemImage: "message.fill") }
                .tag(MainAppTab.messages)
                .badge(app.internalUnreadCount)
            NavigationStack { BusinessCenterHomeView() }
                .tabItem { Label("业务", systemImage: "briefcase.fill") }
                .tag(MainAppTab.business)
            NavigationStack {
                MyWorkspaceView()
                    .navigationDestination(isPresented: $showsProfileSettingsPreview) {
                        ProfileSettingsView()
                    }
            }
                .tabItem { Label("我的", systemImage: "person.fill") }
                .tag(MainAppTab.my)
        }
        .tint(Color.quadTeal)
    }
}

private struct InterfaceLanguageMenu: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        Menu {
            ForEach(InterfaceLanguage.allCases) { language in
                Button {
                    app.setInterfaceLanguage(language)
                } label: {
                    if app.interfaceLanguage == language {
                        Label(language.displayName, systemImage: "checkmark")
                    } else {
                        Text(language.displayName)
                    }
                }
            }
        } label: {
            Label(app.interfaceLanguage.displayName, systemImage: "globe")
        }
        .accessibilityLabel("界面语言")
    }
}

private enum MainAppTab: String, Hashable {
    case messages
    case business
    case my
}

private struct AppVersionNoticeView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        switch app.appVersionState {
        case .optionalUpdate(let policy):
            notice(policy: policy, required: false)
        case .requiredUpdate(let policy):
            notice(policy: policy, required: true)
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func notice(policy: AppVersionPolicy, required: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: required ? "exclamationmark.shield.fill" : "arrow.up.circle.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text(required ? "必须更新 App" : "App 有新版本")
                    .font(.subheadline.weight(.bold))
                Text(required ? "业务写入已暂停；请先安装 \(policy.latestVersion)" : "可安装最新版本 \(policy.latestVersion)")
                    .font(.caption)
            }
            Spacer(minLength: 4)
            if let url = URL(string: policy.updateURL), url.scheme == "https" {
                Link(required ? "立即更新" : "查看", destination: url)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.borderedProminent)
                    .tint(required ? Color.quadRose : Color.quadTeal)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 9)
        .foregroundStyle(required ? Color.quadRose : Color.primary)
        .background(required ? Color.quadRose.opacity(0.11) : Color.quadTeal.opacity(0.11))
    }
}

private enum AppHomeSection: Hashable { case today, business, records, account }

struct AppHomeView: View {
    @EnvironmentObject private var app: AppState
    @State private var expanded: Set<AppHomeSection> = [.today, .business, .records, .account]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                AppHomeHero()

                if app.dashboard?.activeShift == nil {
                    Button { Task { await app.clockIn() } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "location.circle.fill")
                                .font(.title2).foregroundStyle(Color.quadGreen)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("尚未上班").font(.headline).foregroundStyle(.primary)
                                Text("开始上班后按工作时段记录定位")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(app.isAttendanceBusy)
                    .quadCard()
                }

                HomeDisclosureSection(
                    title: "今日工作", subtitle: "上班、行程和附近客户",
                    systemImage: "calendar.badge.clock", color: .quadOrange,
                    isExpanded: expansionBinding(for: .today)
                ) {
                    HomeDestinationRow(title: "今日拜访", subtitle: "查看今天计划与进行中客户", systemImage: "location.fill", color: .quadOrange) { TodayVisitsView() }
                    HomeDestinationRow(title: "附近客户", subtitle: "按定位或城市查看客户", systemImage: "map.fill", color: .quadRose) { NearbyCustomersView() }
                    HomeDestinationRow(title: "上下班与定位", subtitle: "查看工作班次及同步状态", systemImage: "clock.fill", color: .quadGreen) { ShiftManagementView() }
                }

                HomeDisclosureSection(
                    title: "业务", subtitle: "客户、计划、拜访与总结",
                    systemImage: "briefcase.fill", color: .quadTeal,
                    isExpanded: expansionBinding(for: .business)
                ) {
                    HomeDestinationRow(title: "业务员管理中心", subtitle: "进入六个业务入口和今日概览", systemImage: "square.grid.2x2.fill", color: .quadTeal) { BusinessCenterHomeView() }
                    HomeDestinationRow(title: "新增客户", subtitle: "录入客户资料", systemImage: "plus", color: .quadTeal) { NewCustomerView() }
                    HomeDestinationRow(title: "客户列表", subtitle: "按账号权限查看客户", systemImage: "person.2.fill", color: .blue) { CustomerListView() }
                    HomeDestinationRow(title: "计划拜访", subtitle: "查看已加入客户并安排时间", systemImage: "checkmark", color: .quadPurple) { PlanCustomerSelectionView() }
                }

                HomeDisclosureSection(
                    title: "记录", subtitle: "日报、拜访结果和待同步资料",
                    systemImage: "doc.text.fill", color: .quadGreen,
                    isExpanded: expansionBinding(for: .records)
                ) {
                    HomeDestinationRow(title: "工作日报", subtitle: "查看自动汇总并提交今日工作", systemImage: "doc.text.fill", color: .quadGreen) { DailyReportView() }
                    HomeDestinationRow(title: "拜访记录", subtitle: "查看已完成与进行中的拜访", systemImage: "checkmark.circle.fill", color: .quadTeal) { RecordsWorkspaceView() }
                }

                HomeDisclosureSection(
                    title: "我的", subtitle: "账号、客户端和系统操作",
                    systemImage: "person.fill", color: .quadNavy,
                    isExpanded: expansionBinding(for: .account)
                ) {
                    HomeDestinationRow(title: "账号与客户端", subtitle: "查看登录账号与当前版本", systemImage: "person.crop.circle", color: .quadNavy) { MyWorkspaceView() }
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("首页")
        .navigationBarTitleDisplayMode(.inline)
        .task { if app.customers.isEmpty { await app.loadCustomers() } }
    }

    private func expansionBinding(for section: AppHomeSection) -> Binding<Bool> {
        Binding(
            get: { expanded.contains(section) },
            set: { isExpanded in
                if isExpanded { expanded.insert(section) } else { expanded.remove(section) }
            }
        )
    }
}

private struct AppHomeHero: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("LIDA GROUP WORKSPACE")
                        .font(.caption2.weight(.bold)).tracking(1.3)
                        .foregroundStyle(.white.opacity(0.72))
                    Text("QUaD Field Sales").font(.title.weight(.bold)).foregroundStyle(.white)
                    Text(app.user?.displayName ?? app.user?.loginName ?? "员工工作台")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.82))
                }
                Spacer()
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 38)).foregroundStyle(.white.opacity(0.9))
            }
            Text("从总首页展开板块，再进入独立业务页面")
                .font(.caption).foregroundStyle(.white.opacity(0.7))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Color.quadNavy, Color.quadTeal], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .shadow(color: Color.quadNavy.opacity(0.18), radius: 14, y: 7)
    }
}

private struct HomeDisclosureSection<Content: View>: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let color: Color
    @Binding var isExpanded: Bool
    @ViewBuilder let content: () -> Content

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(spacing: 0) { content() }.padding(.top, 10)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.headline).foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(color, in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(LocalizedStringKey(title)).font(.headline).foregroundStyle(.primary)
                    Text(LocalizedStringKey(subtitle)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .tint(color)
        .quadCard()
    }
}

private struct HomeDestinationRow<Destination: View>: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let color: Color
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink(destination: destination()) {
            HStack(spacing: 11) {
                Image(systemName: systemImage).foregroundStyle(color).frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LocalizedStringKey(title)).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    Text(LocalizedStringKey(subtitle)).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().padding(.leading, 37)
    }
}

struct BusinessCenterHomeView: View {
    @EnvironmentObject private var app: AppState

    private var actions: [HomeAction] {
        [
            .init(title: "新增客户", subtitle: "录入新客户资料", symbol: "plus", color: .quadTeal),
            .init(title: "客户列表", subtitle: app.canViewAllCustomers ? "查看企业全部客户" : "查看本人录入客户", symbol: "person.2.fill", color: .blue),
            .init(title: "今日拜访", subtitle: "今天计划与进行中", symbol: "scope", color: .quadOrange),
            .init(title: "计划拜访", subtitle: "选择客户并安排时间", symbol: "checkmark", color: .quadPurple),
            .init(title: "工作日报", subtitle: "记录今天完成事项", symbol: "text.justify", color: .quadGreen),
            .init(title: "附近客户", subtitle: "\(app.region.defaultCity)周边", symbol: "scope", color: .quadRose)
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                BusinessModuleHero()
                QuadSectionHeader(
                    title: "上下班打卡",
                    trailing: app.dashboard?.activeShift == nil ? "尚未上班" : "上班中"
                )
                HomeAttendanceCard()
                QuadSectionHeader(title: "常用功能", trailing: "点击进入独立页面")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(Array(actions.enumerated()), id: \.offset) { index, item in
                        destination(for: index) { HomeActionTile(action: item) }.buttonStyle(.plain)
                    }
                }
                QuadSectionHeader(title: "今日概览", trailing: "只显示数量")
                HStack(spacing: 0) {
                    QuadMetric(value: "\(app.activePlans.count)", label: "计划拜访")
                    Rectangle().fill(Color(uiColor: .separator)).frame(width: 0.5, height: 38)
                    QuadMetric(value: "\(app.activePlans.filter { $0.status == "COMPLETED" }.count)", label: "已经完成")
                    Rectangle().fill(Color(uiColor: .separator)).frame(width: 0.5, height: 38)
                    QuadMetric(value: "\(app.activePlans.filter { $0.status != "COMPLETED" }.count)", label: "待跟进")
                }
                .quadCard()
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
        .quadScreen()
        .navigationTitle("业务")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await app.updateWholeSystem() }
                } label: {
                    if app.isRefreshingBusinessData || app.appVersionState.isChecking {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(app.isRefreshingBusinessData || app.appVersionState.isChecking)
                .accessibilityLabel("一键更新整个系统")
                .accessibilityHint("更新业务资料、补传本机数据并检查 App 新版本")
            }
        }
        .task { if app.customers.isEmpty { await app.loadCustomers() } }
    }

    @ViewBuilder
    private func destination<Label: View>(for index: Int, @ViewBuilder label: () -> Label) -> some View {
        switch index {
        case 0: NavigationLink(destination: NewCustomerView(), label: label)
        case 1: NavigationLink(destination: CustomerListView(), label: label)
        case 2: NavigationLink(destination: TodayVisitsView(), label: label)
        case 3: NavigationLink(destination: PlanCustomerSelectionView(), label: label)
        case 4: NavigationLink(destination: DailyReportView(), label: label)
        default: NavigationLink(destination: NearbyCustomersView(), label: label)
        }
    }
}

private struct HomeAttendanceCard: View {
    @EnvironmentObject private var app: AppState

    private var activeShift: Shift? { app.dashboard?.activeShift }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: activeShift == nil ? "clock.badge.questionmark" : "location.circle.fill")
                    .font(.title2)
                    .foregroundStyle(activeShift == nil ? Color.quadOrange : Color.quadGreen)
                VStack(alignment: .leading, spacing: 3) {
                    Text(activeShift == nil ? "等待上班打卡" : "今天已上班")
                        .font(.headline)
                    if let activeShift {
                        Text("打卡时间 \(app.region.formatTime(activeShift.clockInServerAt)) · \(activeShift.clockInAddress ?? "位置已记录")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    } else {
                        Text("上班打卡后开始工作时段定位")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }

            Divider()

            HStack(spacing: 12) {
                Button {
                    Task { await app.clockIn() }
                } label: {
                    Label("上班打卡", systemImage: "location.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.quadGreen)
                .controlSize(.large)
                .disabled(activeShift != nil || app.isAttendanceBusy)

                Button {
                    Task { await app.clockOut() }
                } label: {
                    Label("下班打卡", systemImage: "stop.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.quadRose)
                .controlSize(.large)
                .disabled(activeShift == nil || app.isAttendanceBusy)
            }

            if app.isAttendanceBusy {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(app.attendanceActionStatus)
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.quadTeal)
            } else if !app.attendanceActionStatus.isEmpty {
                Label(app.attendanceActionStatus, systemImage: activeShift == nil ? "clock.fill" : "location.fill")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(activeShift == nil ? Color.quadOrange : Color.quadGreen)
            }

            Label(
                activeShift == nil
                    ? "先点上班打卡；服务器确认后，下班按钮会立即启用"
                    : "当前为上班中；点击下班打卡后立即停止工作定位",
                systemImage: "location.shield.fill"
            )
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .quadCard()
    }

}

private struct BusinessModuleHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("QUaD FIELD SALES")
                .font(.caption.weight(.bold)).fontWidth(.expanded).tracking(1.4)
                .foregroundStyle(.white.opacity(0.9))
            Text("业务员管理中心").font(.title.weight(.bold)).foregroundStyle(.white)
            Text("客户 · 计划 · 拜访 · 总结").font(.title3).foregroundStyle(.white.opacity(0.84))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.39, blue: 0.45), Color.quadTeal],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .shadow(color: Color.quadTeal.opacity(0.18), radius: 14, y: 8)
    }
}

private struct HomeAction {
    let title: String
    let subtitle: String
    let symbol: String
    let color: Color
}

private struct HomeActionTile: View {
    let action: HomeAction

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            Image(systemName: action.symbol)
                .font(.title3.weight(.bold)).foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(action.color, in: RoundedRectangle(cornerRadius: 13))
            Text(LocalizedStringKey(action.title)).font(.title3.weight(.bold)).foregroundStyle(.primary)
            Text(LocalizedStringKey(action.subtitle))
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary).lineLimit(2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 142, alignment: .topLeading)
        .background(action.color.opacity(0.075))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 22).stroke(action.color.opacity(0.08), lineWidth: 0.5) }
    }
}

struct ShiftManagementView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                QuadHero(
                    kicker: "WORK SHIFT",
                    title: app.dashboard?.activeShift == nil ? "尚未上班" : "上班中",
                    subtitle: "仅在工作时段记录定位，下班后立即停止",
                    color: .quadGreen
                )
                VStack(alignment: .leading, spacing: 14) {
                    QuadSectionHeader(title: "工作状态")
                    ArtifactChecklistRow(title: "定位权限", detail: app.location.status, done: true)
                    ArtifactChecklistRow(
                        title: "打卡操作",
                        detail: app.attendanceActionStatus.isEmpty ? "等待操作" : app.attendanceActionStatus,
                        done: !app.isAttendanceBusy
                    )
                    ArtifactChecklistRow(title: "会议语音待上传", detail: "\(app.recorder.pendingCount) 个本机分段", done: app.recorder.pendingCount == 0)
                    ArtifactChecklistRow(title: "今日定位点", detail: "\(app.dashboard?.route.count ?? 0) 个", done: true)
                }
                .quadCard()
                if app.dashboard?.activeShift == nil {
                    QuadPrimaryButton(
                        title: app.isAttendanceBusy ? "正在处理…" : "开始上班",
                        systemImage: "play.fill",
                        color: .quadGreen,
                        isEnabled: !app.isAttendanceBusy
                    ) { Task { await app.clockIn() } }
                } else {
                    QuadPrimaryButton(
                        title: app.isAttendanceBusy ? "正在处理…" : "下班并停止定位",
                        systemImage: "stop.fill",
                        color: .quadRose,
                        isEnabled: !app.isAttendanceBusy
                    ) { Task { await app.clockOut() } }
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("上下班与定位")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct RecordsWorkspaceView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                QuadHero(kicker: "WORK RECORDS", title: "工作记录", subtitle: "日报、拜访结果和同步状态", color: .quadGreen)
                NavigationLink(destination: DailyReportView()) {
                    HomeRecordCard(title: "工作日报", detail: "自动汇总今日客户、样品、订单和跟进", systemImage: "doc.text.fill", color: .quadGreen)
                }
                .buttonStyle(.plain)
                QuadSectionHeader(title: "拜访记录", trailing: "\(app.activePlans.count) 条")
                ForEach(Array(app.activePlans.enumerated()), id: \.element.id) { index, plan in
                    NavigationLink(destination: VisitExecutionView(plan: plan)) {
                        VStack { VisitPlanRow(plan: plan, sequence: index + 1, color: .quadTeal, isCompleted: plan.status == "COMPLETED") }
                            .quadCard()
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .quadScreen()
        .navigationTitle("记录")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HomeRecordCard: View {
    let title: String
    let detail: String
    let systemImage: String
    let color: Color

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: systemImage)
                .font(.title3).foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(color, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text(LocalizedStringKey(title)).font(.headline).foregroundStyle(.primary)
                Text(LocalizedStringKey(detail)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.secondary)
        }
        .quadCard()
    }
}

struct MyWorkspaceView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        List {
            Section {
                NavigationLink(destination: ProfileSettingsView()) {
                    HStack(spacing: 14) {
                        ProfileAvatarView(
                            data: app.profileAvatarData,
                            fallbackName: app.displayedProfileName,
                            size: 64,
                            cornerRadius: 14
                        )
                        VStack(alignment: .leading, spacing: 5) {
                            Text(app.displayedProfileName)
                                .font(.title3.weight(.bold))
                            Text(app.user?.position ?? app.user?.roles?.joined(separator: "、") ?? "员工")
                                .font(.subheadline).foregroundStyle(.secondary)
                                .lineLimit(2)
                            Text("力达集团 · \(app.user?.department ?? "销售部")")
                                .font(.caption).foregroundStyle(.secondary)
                            Text("点击修改头像、姓名与账号安全")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Color.quadTeal)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }

            Section("员工服务") {
                NavigationLink(destination: LeaveRequestView()) {
                    MyMenuRow(title: "请假申请", detail: "选择审批人并发送可追踪申请", systemImage: "calendar.badge.clock", color: .quadPurple)
                }
                NavigationLink(destination: ExpenseClaimView()) {
                    MyMenuRow(title: "报销申请", detail: "进入 QEOS 企业费用审批流程", systemImage: "creditcard.fill", color: .quadOrange)
                }
            }

            Section("App 与数据") {
                Picker("界面语言", selection: Binding(
                    get: { app.interfaceLanguage },
                    set: { app.setInterfaceLanguage($0) }
                )) {
                    ForEach(InterfaceLanguage.allCases) { language in
                        Text(language.displayName).tag(language)
                    }
                }
                .pickerStyle(.segmented)
                LabeledContent("当前版本", value: app.currentAppVersion)
                LabeledContent("地区规则", value: "\(app.region.regionDisplayName) · \(app.region.currencyCode)")
                LabeledContent("地图服务", value: app.region.mapProvider.displayName)
            }

            Section("账号") {
                LabeledContent("登录账号", value: app.user?.loginName ?? "—")
                Button(role: .destructive) {
                    Task { await app.logout() }
                } label: {
                    Label("退出当前账号", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("我的")
        .navigationBarTitleDisplayMode(.inline)
        .task { await app.checkAppVersion() }
    }

}

private struct ProfileSettingsView: View {
    @EnvironmentObject private var app: AppState
    @State private var displayName = ""
    @State private var avatarData: Data?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var savedStatus = ""

    var body: some View {
        Form {
            Section {
                VStack(spacing: 14) {
                    ProfileAvatarView(
                        data: avatarData,
                        fallbackName: displayName.isEmpty ? app.displayedProfileName : displayName,
                        size: 104,
                        cornerRadius: 28
                    )
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Label("选择 / 更换头像", systemImage: "photo.badge.plus")
                            .font(.headline)
                    }
                    if avatarData != nil {
                        Button("移除头像", role: .destructive) {
                            avatarData = nil
                            savedStatus = "尚未保存"
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            } footer: {
                Text("头像和姓名会保存到当前 iPhone，并同步到企业系统的员工资料、手机站内信息和网页站内留言；不使用现场拜访照片。")
            }

            Section("个人资料") {
                TextField("姓名", text: $displayName)
                    .textContentType(.name)
                Button {
                    Task { await saveProfile() }
                } label: {
                    Label(savedStatus == "正在同步企业系统…" ? "正在同步…" : "保存头像与姓名", systemImage: "checkmark.circle.fill")
                }
                .disabled(
                    savedStatus == "正在同步企业系统…"
                    || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
                if !savedStatus.isEmpty {
                    Label(savedStatus, systemImage: savedStatus == "已同步到企业系统" ? "checkmark.circle.fill" : "clock")
                        .font(.footnote)
                        .foregroundStyle(savedStatus == "已同步到企业系统" ? Color.quadGreen : Color.secondary)
                }
            }

            Section {
                NavigationLink(destination: LoginAccountEditorView()) {
                    LabeledContent("修改登录账号", value: app.user?.loginName ?? "—")
                }
                NavigationLink(destination: PasswordEditorView()) {
                    Label("修改登录密码", systemImage: "lock.rotation")
                }
            } header: {
                Text("账号安全")
            } footer: {
                Text("登录账号与密码由公司服务器验证；修改成功后会退出当前登录，必须用新账号或新密码重新登录。")
            }
        }
        .navigationTitle("个人资料与账号安全")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .onAppear {
            displayName = app.displayedProfileName
            avatarData = app.profileAvatarData
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task { await loadAvatar(item) }
        }
    }

    private func saveProfile() async {
        savedStatus = "正在同步企业系统…"
        let synchronized = await app.saveProfilePresentation(displayName: displayName, avatarData: avatarData)
        savedStatus = synchronized ? "已同步到企业系统" : "已保存到本机，服务器待同步"
    }

    private func loadAvatar(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard let source = try? await item.loadTransferable(type: Data.self),
              let normalized = normalizedAvatarData(source) else {
            app.errorMessage = "头像图片读取失败，请重新选择"
            return
        }
        avatarData = normalized
        savedStatus = "尚未保存"
    }

    private func normalizedAvatarData(_ source: Data) -> Data? {
        guard let image = UIImage(data: source) else { return nil }
        let longestEdge = max(image.size.width, image.size.height)
        let scale = min(1, 1024 / max(longestEdge, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let normalized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return normalized.jpegData(compressionQuality: 0.84)
    }
}

private struct LoginAccountEditorView: View {
    @EnvironmentObject private var app: AppState
    @State private var loginName = ""

    var body: some View {
        Form {
            Section("当前登录账号") {
                Text(app.user?.loginName ?? "—")
                    .textSelection(.enabled)
            }
            Section {
                TextField("新的登录账号", text: $loginName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(.username)
            } header: {
                Text("新账号")
            } footer: {
                Text("账号必须在本企业内唯一。现有服务器会把服务器显示名同步为新账号；当前 iPhone 的姓名仍按个人资料页单独显示。此操作需要 user:write 权限，普通员工如无权限应由管理员修改。")
            }
            Section {
                Button {
                    Task { _ = await app.updateLoginAccount(loginName) }
                } label: {
                    HStack {
                        Spacer()
                        if app.isBusy { ProgressView() }
                        Text(app.isBusy ? "正在修改…" : "确认修改并重新登录")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .disabled(
                    app.isBusy
                    || loginName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || loginName.trimmingCharacters(in: .whitespacesAndNewlines) == app.user?.loginName
                )
            }
        }
        .navigationTitle("修改登录账号")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .onAppear { loginName = app.user?.loginName ?? "" }
    }
}

private struct PasswordEditorView: View {
    @EnvironmentObject private var app: AppState
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""

    var body: some View {
        Form {
            Section("当前密码") {
                SecureField("输入当前密码", text: $currentPassword)
                    .textContentType(.password)
            }
            Section {
                SecureField("输入新密码", text: $newPassword)
                    .textContentType(.newPassword)
                SecureField("再次输入新密码", text: $confirmation)
                    .textContentType(.newPassword)
                if !confirmation.isEmpty && newPassword != confirmation {
                    Label("两次输入的新密码不一致", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Color.quadRose)
                }
            } header: {
                Text("新密码")
            } footer: {
                Text("至少 10 个字符，且不能与当前密码相同。密码不会以明文保存在 App 内。")
            }
            Section {
                Button {
                    Task {
                        guard newPassword == confirmation else {
                            app.errorMessage = "两次输入的新密码不一致"
                            return
                        }
                        _ = await app.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                        currentPassword = ""
                        newPassword = ""
                        confirmation = ""
                    }
                } label: {
                    HStack {
                        Spacer()
                        if app.isBusy { ProgressView() }
                        Text(app.isBusy ? "正在修改…" : "确认修改并重新登录")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .disabled(
                    app.isBusy
                    || currentPassword.isEmpty
                    || newPassword.count < 10
                    || newPassword != confirmation
                )
            }
        }
        .navigationTitle("修改登录密码")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
    }
}

private struct ProfileAvatarView: View {
    let data: Data?
    let fallbackName: String
    let size: CGFloat
    let cornerRadius: CGFloat

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(String(fallbackName.prefix(1)).uppercased())
                    .font(.system(size: size * 0.48, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.quadTeal)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(Color.white.opacity(0.75), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.08), radius: 8, y: 4)
        .accessibilityLabel("个人头像")
    }
}

private struct MyMenuRow: View {
    let title: String
    let detail: String
    let systemImage: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(LocalizedStringKey(title)).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(LocalizedStringKey(detail)).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 3)
    }
}

struct DesignPreviewRouter: View {
    @EnvironmentObject private var app: AppState
    let page: DesignPreviewPage
    @State private var path: [DesignPreviewPage] = []

    var body: some View {
        NavigationStack(path: $path) {
            BusinessCenterHomeView()
                .navigationDestination(for: DesignPreviewPage.self) { destination(for: $0) }
                .task {
                    guard path.isEmpty else { return }
                    path = Self.previewPath(to: page)
                }
        }
    }

    @ViewBuilder
    private func destination(for page: DesignPreviewPage) -> some View {
        switch page {
        case .home: BusinessCenterHomeView()
        case .newCustomer: NewCustomerView()
        case .customers: CustomerListView()
        case .planCustomers: PlanCustomerSelectionView()
        case .planSchedule: PlanScheduleView(selectedCustomers: Array(app.customers.prefix(3)))
        case .today: TodayVisitsView()
        case .execution: VisitExecutionView(plan: app.selectedPlan)
        case .photos: VisitPhotosView(plan: app.selectedPlan)
        case .meeting: MeetingNotesView(plan: app.selectedPlan)
        case .samples: SamplesAndConsignmentView(plan: app.selectedPlan)
        case .order: OnsiteOrderView(plan: app.selectedPlan)
        case .receipt: CustomerReceiptView(plan: app.selectedPlan)
        case .followUp: FollowUpView(plan: app.selectedPlan)
        case .completion: VisitCompletionView(plan: app.selectedPlan)
        case .report: DailyReportView()
        case .nearby: NearbyCustomersView()
        }
    }

    private static func previewPath(to page: DesignPreviewPage) -> [DesignPreviewPage] {
        switch page {
        case .home:
            []
        case .planSchedule:
            [.planCustomers, .planSchedule]
        case .execution:
            [.today, .execution]
        case .photos, .meeting, .samples, .order, .receipt, .followUp, .completion:
            [.today, .execution, page]
        default:
            [page]
        }
    }
}
