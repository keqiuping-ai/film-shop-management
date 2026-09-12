import SwiftUI

struct LeaveRequestView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var approverId = ""
    @State private var leaveType = "事假"
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var reason = ""
    @State private var handover = ""

    private let leaveTypes = ["事假", "病假", "年假", "调休", "婚假", "产假 / 陪产假", "其他"]

    var body: some View {
        Form {
            Section("申请信息") {
                Picker("请假类型", selection: $leaveType) {
                    ForEach(leaveTypes, id: \.self) { Text($0) }
                }
                DatePicker("开始时间", selection: $startDate)
                DatePicker("结束时间", selection: $endDate)
                Picker("审批人", selection: $approverId) {
                    Text("请选择审批人").tag("")
                    ForEach(app.internalMessageUsers) { user in
                        Text(user.resolvedName).tag(user.userId)
                    }
                }
            }

            Section("请假原因") {
                TextEditor(text: $reason).frame(minHeight: 110)
            }

            Section {
                TextEditor(text: $handover).frame(minHeight: 90)
            } header: {
                Text("工作交接")
            } footer: {
                Text("当前服务器没有独立 HR 请假审批接口；提交后会生成一条可追踪的站内申请并发送给所选审批人。")
            }

            Section {
                Button {
                    Task {
                        if await app.submitLeaveRequest(
                            approverId: approverId,
                            leaveType: leaveType,
                            startDate: startDate,
                            endDate: endDate,
                            reason: reason,
                            handover: handover
                        ) {
                            dismiss()
                        }
                    }
                } label: {
                    Label(app.isBusy ? "正在提交…" : "提交请假申请", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(app.isBusy || approverId.isEmpty || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle("请假申请")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if app.internalMessageUsers.isEmpty { await app.loadInternalMessages() }
            if approverId.isEmpty { approverId = app.internalMessageUsers.first?.userId ?? "" }
        }
    }
}

private enum ExpenseCategory: String, CaseIterable, Identifiable {
    case travel = "TRAVEL"
    case entertainment = "ENTERTAINMENT"
    case procurement = "PROCUREMENT"
    case office = "OFFICE"
    case maintenance = "MAINTENANCE"
    case vehicle = "VEHICLE"
    case marketing = "MARKETING"
    case other = "OTHER"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .travel: "差旅费"
        case .entertainment: "业务招待"
        case .procurement: "采购费用"
        case .office: "办公费用"
        case .maintenance: "维修费用"
        case .vehicle: "车辆费用"
        case .marketing: "市场费用"
        case .other: "其他费用"
        }
    }
}

struct ExpenseClaimView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var department = ""
    @State private var category: ExpenseCategory = .travel
    @State private var amount = 0.0
    @State private var expenseDate = Date()
    @State private var vendorName = ""
    @State private var invoiceNumber = ""
    @State private var city = ""
    @State private var receiptReference = ""
    @State private var description = ""

    var body: some View {
        Form {
            Section("报销信息") {
                TextField("部门", text: $department)
                Picker("费用类别", selection: $category) {
                    ForEach(ExpenseCategory.allCases) { item in Text(item.title).tag(item) }
                }
                HStack {
                    Text("金额")
                    Spacer()
                    Text(app.region.currencyCode).foregroundStyle(.secondary)
                    TextField("0.00", value: $amount, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 130)
                }
                DatePicker("费用日期", selection: $expenseDate, displayedComponents: .date)
                TextField("发生城市", text: $city)
            }

            Section("商户和票据") {
                TextField("商户 / 收款方", text: $vendorName)
                TextField("发票号码（没有可不填）", text: $invoiceNumber)
                TextField("发票或付款凭证编号", text: $receiptReference)
            }

            Section {
                TextEditor(text: $description).frame(minHeight: 120)
            } header: {
                Text("费用说明")
            } footer: {
                Text("提交后进入 QEOS 企业费用流程，并按费用政策、预算及审批权限处理；App 不伪造财务付款结果。")
            }

            Section {
                Button {
                    Task {
                        if await app.submitExpenseClaim(
                            department: department,
                            category: category.rawValue,
                            amount: amount,
                            expenseDate: expenseDate,
                            vendorName: vendorName,
                            invoiceNumber: invoiceNumber,
                            city: city,
                            receiptReference: receiptReference,
                            description: description
                        ) {
                            dismiss()
                        }
                    }
                } label: {
                    Label(app.isBusy ? "正在提交…" : "提交报销申请", systemImage: "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    app.isBusy
                        || department.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || amount <= 0
                        || description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
            }
        }
        .navigationTitle("报销申请")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if department.isEmpty { department = app.user?.department ?? "销售部" }
            if city.isEmpty { city = app.region.defaultCity }
        }
    }
}
