import Foundation

actor APIClient {
    static let shared = APIClient()
    private let baseURL: URL
    private let encoder: JSONEncoder = {
        let value = JSONEncoder()
        value.dateEncodingStrategy = .iso8601
        return value
    }()
    private let decoder: JSONDecoder = {
        let value = JSONDecoder()
        value.dateDecodingStrategy = .iso8601
        return value
    }()
    private var token: String?
    private var currentUserId: String?
    private var messageSendersById: [String: String] = [:]
    private var regionalConfiguration = RegionalConfiguration.china

    init(baseURL: URL? = nil) {
        let environmentURL = ProcessInfo.processInfo.environment["QUAD_API_BASE_URL"].flatMap(URL.init(string:))
        self.baseURL = baseURL
            ?? environmentURL
            ?? URL(string: "https://film-shop-management-production.up.railway.app")!
    }

    func setToken(_ value: String?) {
        token = value
        if value == nil {
            currentUserId = nil
            messageSendersById = [:]
        }
    }
    func setRegionalConfiguration(_ value: RegionalConfiguration) { regionalConfiguration = value }

    func versionPolicy(currentVersion: String) async throws -> AppVersionPolicy {
        let encoded = currentVersion.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? currentVersion
        return try await request(
            "/api/mobile/version-policy?platform=ios&currentVersion=\(encoded)",
            authenticated: false
        )
    }

    func login(account: String, password: String) async throws -> LoginResponse {
        let body = ["email": account, "password": password]
        let response: QUaDLoginResponse = try await request(
            "/api/login",
            method: "POST",
            body: try encoder.encode(body),
            authenticated: false
        )
        token = response.token
        currentUserId = response.user.id
        return LoginResponse(accessToken: response.token, user: response.user.appUser)
    }

    func me() async throws -> UserProfile {
        let response: QUaDMobileBootstrap = try await request("/api/mobile/bootstrap")
        currentUserId = response.user.id
        return response.user.appUser
    }

    func updateProfile(displayName: String) async throws -> UserProfile {
        try await request(
            "/api/auth/profile",
            method: "PUT",
            body: try encoder.encode(["displayName": displayName])
        )
    }

    func updateLoginAccount(
        userId: String,
        loginName: String,
        roles: [String],
        department: String?,
        position: String?
    ) async throws -> UserProfile {
        let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userId
        let body = UserAccountUpdateRequest(
            displayName: loginName,
            roles: roles,
            department: department ?? "",
            position: position ?? ""
        )
        return try await request(
            "/api/users/\(encodedUserId)",
            method: "PUT",
            body: try encoder.encode(body)
        )
    }

    func changePassword(currentPassword: String, newPassword: String) async throws -> PasswordChangeResponse {
        let body = PasswordChangeRequest(
            currentPassword: currentPassword,
            newPassword: newPassword
        )
        return try await request(
            "/api/auth/change-password",
            method: "POST",
            body: try encoder.encode(body)
        )
    }

    func collaborationOverview() async throws -> CollaborationOverview {
        let response: QUaDMessageOverview = try await request("/api/messages")
        messageSendersById = Dictionary(uniqueKeysWithValues: response.messages.map { ($0.id, $0.fromUserId) })
        return response.appOverview(currentUserId: currentUserId ?? "")
    }

    func sendInternalMessage(
        recipientId: String,
        subject: String,
        content: String,
        clientMessageId: String? = nil
    ) async throws -> InternalMessageSendResponse {
        let requestId = clientMessageId ?? UUID().uuidString
        let cleanSubject = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let messageText = cleanSubject.isEmpty ? content : "\(cleanSubject)\n\(content)"
        let body: [String: AnyEncodable] = [
            "toUserId": .string(recipientId),
            "text": .string(messageText),
            "clientRequestId": .string(requestId)
        ]
        let response: QUaDMessageMutationResponse = try await request(
            "/api/messages",
            method: "POST",
            body: try encoder.encode(body)
        )
        guard let saved = response.messages.last(where: {
            $0.clientRequestId == requestId && $0.fromUserId == currentUserId
        }) else {
            throw APIError.message("QUaD 主系统没有确认刚发送的内部消息")
        }
        messageSendersById[saved.id] = saved.fromUserId
        return InternalMessageSendResponse(messageId: saved.id, status: "SENT")
    }

    func markInternalMessageRead(_ messageId: String) async throws -> InternalMessageSendResponse {
        guard let fromUserId = messageSendersById[messageId], !fromUserId.isEmpty else {
            return InternalMessageSendResponse(messageId: messageId, status: "READ")
        }
        let response: QUaDMessageMutationResponse = try await request(
            "/api/messages/read",
            method: "PUT",
            body: try encoder.encode(["fromUserId": fromUserId])
        )
        guard response.messages.contains(where: { $0.id == messageId }) else {
            throw APIError.message("QUaD 主系统没有确认消息已读状态")
        }
        return InternalMessageSendResponse(messageId: messageId, status: "READ")
    }

    func createExpenseClaim(
        employeeName: String,
        department: String,
        category: String,
        amount: Double,
        currency: String,
        expenseDate: String,
        vendorName: String,
        invoiceNumber: String,
        city: String,
        receiptReference: String,
        description: String
    ) async throws -> ExpenseClaimCreateResponse {
        let body: [String: AnyEncodable] = [
            "employeeName": .string(employeeName),
            "department": .string(department),
            "category": .string(category),
            "amount": .double(amount),
            "currency": .string(currency),
            "expenseDate": .string(expenseDate),
            "vendorName": .string(vendorName),
            "invoiceNumber": .string(invoiceNumber),
            "taxNumber": .string(""),
            "city": .string(city),
            "sourceModule": .string("MANUAL"),
            "sourceObjectId": .string(""),
            "sourceObjectCode": .string(""),
            "receiptReference": .string(receiptReference),
            "description": .string(description)
        ]
        return try await request(
            "/api/enterprise-expenses/claims",
            method: "POST",
            body: try encoder.encode(body)
        )
    }

    func submitExpenseClaim(_ claimId: String) async throws -> ExpenseClaimSubmitResponse {
        let body: [String: AnyEncodable] = ["claimId": .string(claimId)]
        return try await request(
            "/api/enterprise-expenses/claims/submit",
            method: "POST",
            body: try encoder.encode(body)
        )
    }

    func customers() async throws -> [CustomerSummary] {
        let response: QUaDMobileBootstrap = try await request("/api/mobile/bootstrap")
        return response.fieldSales.accounts.map(\.appCustomer)
    }

    func dashboard(date: String) async throws -> FieldDashboard {
        let response: QUaDMobileBootstrap = try await request("/api/mobile/bootstrap")
        return response.appDashboard(for: date)
    }

    func createCustomer(_ draft: CustomerDraft) async throws -> CustomerSummary {
        let payload = QUaDCreateCustomerRequest(
            businessName: draft.customerName,
            address: draft.address,
            city: "",
            phone: draft.phone,
            email: draft.email,
            customerType: draft.customerType,
            source: draft.sourceChannel,
            contactName: draft.contactDisplayName,
            note: draft.notes,
            language: "zh"
        )
        let response: QUaDMobileBootstrap = try await request(
            "/api/field-sales/accounts",
            method: "POST",
            body: try encoder.encode(payload)
        )
        guard let saved = response.fieldSales.accounts.first(where: {
            $0.businessName == draft.customerName && $0.address == draft.address
        }) else {
            throw APIError.message("QUaD 主系统没有返回刚保存的客户")
        }
        return saved.appCustomer
    }

    func createVisitPlan(
        customer: CustomerSummary,
        scheduledAt: Date,
        sequence: Int,
        objective: String = "外勤拜访"
    ) async throws -> VisitPlan {
        let timestamp = regionalTimestamp(scheduledAt)
        let datePart = Self.localDate(scheduledAt, timeZoneIdentifier: regionalConfiguration.timeZoneIdentifier)
            .replacingOccurrences(of: "-", with: "")
        let suffix = String(UUID().uuidString.prefix(6)).uppercased()
        let code = "MPLAN-\(datePart)-\(suffix)"
        return try await createVisitPlan(VisitPlan(
            planId: "pending-\(UUID().uuidString)",
            planCode: code,
            customerId: customer.customerId,
            customerName: customer.customerName,
            contactName: customer.contactName,
            phone: customer.phone,
            scheduledAt: timestamp,
            address: customer.address,
            latitude: nil,
            longitude: nil,
            objective: objective,
            routeSequence: Double(sequence),
            status: "PLANNED",
            cancellationReason: nil
        ))
    }

    /// Uploads a visit plan that was already committed to the phone's durable
    /// queue. The plan code is generated before the first network attempt, so
    /// a retry can recover a response that was lost after the server saved it.
    func createVisitPlan(_ pending: VisitPlan) async throws -> VisitPlan {
        guard pending.planCode?.isEmpty == false else {
            throw APIError.message("本机拜访计划缺少同步编号")
        }
        if let snapshot: QUaDMobileBootstrap = try? await request("/api/mobile/bootstrap"),
           let existing = snapshot.fieldSales.visitPlans?.first(where: { visitPlan($0, matches: pending) }) {
            return existing.appVisitPlan(account: snapshot.fieldSales.account(id: existing.accountId))
        }
        guard let customerId = pending.customerId, !customerId.isEmpty,
              let timestamp = pending.scheduledAt,
              let scheduledDate = ISO8601DateFormatter().date(from: timestamp) else {
            throw APIError.message("本机拜访计划缺少客户或预约时间")
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = regionalConfiguration.timeZone
        let parts = calendar.dateComponents([.hour, .minute], from: scheduledDate)
        let body: [String: AnyEncodable] = [
            "accountIds": .array([.string(customerId)]),
            "date": .string(Self.localDate(scheduledDate, timeZoneIdentifier: regionalConfiguration.timeZoneIdentifier)),
            "startMinutes": .int((parts.hour ?? 0) * 60 + (parts.minute ?? 0)),
            "stayMinutes": .int(45),
            "note": .string(pending.objective ?? "外勤拜访")
        ]
        do {
            let response: QUaDMobileBootstrap = try await request(
                "/api/field-sales/visit-plans",
                method: "POST",
                body: try encoder.encode(body),
                timeoutInterval: 15
            )
            guard let saved = response.fieldSales.visitPlans?.first(where: { visitPlan($0, matches: pending) })
                    ?? response.fieldSales.visitPlans?.first(where: { $0.accountId == customerId }) else {
                throw APIError.message("QUaD 主系统没有返回刚保存的拜访计划")
            }
            return saved.appVisitPlan(account: response.fieldSales.account(id: customerId))
        } catch {
            if let snapshot: QUaDMobileBootstrap = try? await request("/api/mobile/bootstrap"),
               let existing = snapshot.fieldSales.visitPlans?.first(where: { visitPlan($0, matches: pending) }) {
                return existing.appVisitPlan(account: snapshot.fieldSales.account(id: existing.accountId))
            }
            throw error
        }
    }

    private func visitPlan(_ remote: QUaDVisitPlan, matches pending: VisitPlan) -> Bool {
        guard remote.accountId == pending.customerId else { return false }
        guard let lhs = remote.plannedAt.flatMap(ISO8601DateFormatter().date(from:)),
              let rhs = pending.scheduledAt.flatMap(ISO8601DateFormatter().date(from:)) else {
            return remote.date == pending.scheduledAt.map { String($0.prefix(10)) }
        }
        return abs(lhs.timeIntervalSince(rhs)) < 60
    }

    /// The operations API groups plans by the first ten characters of this
    /// value. Preserve the configured business time zone instead of sending a
    /// UTC `Z` timestamp, otherwise an early China appointment can be grouped
    /// under the previous day.
    private func regionalTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withColonSeparatorInTimeZone]
        formatter.timeZone = regionalConfiguration.timeZone
        return formatter.string(from: date)
    }

    func deleteVisitPlan(_ planId: String) async throws -> VisitPlanDeleteResponse {
        let encodedId = planId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? planId
        return try await request(
            "/api/field-sales/visit-plans/\(encodedId)",
            method: "DELETE"
        )
    }

    func startTrip(for plan: VisitPlan, location: CLLocationPayload) async throws -> VisitPlan {
        guard let accountId = plan.customerId, !accountId.isEmpty else {
            throw APIError.message("拜访计划没有关联客户")
        }
        let body: [String: AnyEncodable] = [
            "accountId": .string(accountId),
            "locationConsent": .bool(true),
            "lat": .double(location.latitude),
            "lng": .double(location.longitude),
            "accuracy": .double(location.accuracy)
        ]
        let response: QUaDMobileBootstrap = try await request(
            "/api/field-sales/trips/start",
            method: "POST",
            body: try encoder.encode(body)
        )
        return try response.fieldSales.requiredPlan(id: plan.planId, accountId: accountId)
    }

    func cancelTrip(_ tripId: String, reason: String) async throws {
        let encodedId = tripId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? tripId
        let body: [String: AnyEncodable] = ["reason": .string(reason)]
        let _: QUaDMobileBootstrap = try await request(
            "/api/field-sales/trips/\(encodedId)/cancel",
            method: "PUT",
            body: try encoder.encode(body)
        )
    }

    func startVisit(for plan: VisitPlan, photoURL: String, location: CLLocationPayload) async throws -> VisitPlan {
        guard let accountId = plan.customerId, !accountId.isEmpty else {
            throw APIError.message("拜访计划没有关联客户")
        }
        let body: [String: AnyEncodable] = [
            "accountId": .string(accountId),
            "locationConsent": .bool(true),
            "lat": .double(location.latitude),
            "lng": .double(location.longitude),
            "accuracy": .double(location.accuracy),
            "address": .string(location.address ?? ""),
            "photoUrl": .string(photoURL),
            "contactMet": .string(plan.contactName ?? "")
        ]
        let response: QUaDVisitStartResponse = try await request(
            "/api/field-sales/visits/start",
            method: "POST",
            body: try encoder.encode(body)
        )
        return try response.fieldSales.requiredPlan(id: plan.planId, accountId: accountId)
    }

    func completeVisit(_ plan: VisitPlan, reportText: String) async throws -> VisitPlan {
        guard let accountId = plan.customerId, !accountId.isEmpty else {
            throw APIError.message("拜访计划没有关联客户")
        }
        let current: QUaDMobileBootstrap = try await request("/api/mobile/bootstrap")
        let visitId = current.fieldSales.visitPlans?.first(where: { $0.id == plan.planId })?.visitId
            ?? current.fieldSales.visits?.first(where: {
                $0.accountId == accountId && ["进行中", "拜访中"].contains($0.status)
            })?.id
        guard let visitId, !visitId.isEmpty else {
            throw APIError.message("请先完成到店拍照打卡，再结束拜访")
        }
        let encodedId = visitId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? visitId
        let body: [String: AnyEncodable] = [
            "reportText": .string(reportText),
            "outcome": .string("继续跟进"),
            "nextAction": .string("按计划继续跟进")
        ]
        let response: QUaDMobileBootstrap = try await request(
            "/api/field-sales/visits/\(encodedId)/complete",
            method: "PUT",
            body: try encoder.encode(body)
        )
        return try response.fieldSales.requiredPlan(id: plan.planId, accountId: accountId)
    }

    func submitDailyReport(notes: String, date: String) async throws {
        let body: [String: AnyEncodable] = ["summary": .string(notes), "date": .string(date)]
        let _: QUaDMobileBootstrap = try await request(
            "/api/field-sales/daily-reports",
            method: "POST",
            body: try encoder.encode(body)
        )
    }

    func startShift(latitude: Double, longitude: Double, accuracy: Double, address: String?) async throws -> Shift {
        let body: [String: AnyEncodable] = [
            "type": .string("in"),
            "lat": .double(latitude),
            "lng": .double(longitude),
            "accuracy": .double(accuracy),
            "locationConsent": .bool(true),
            "note": .string(address ?? "")
        ]
        let response: QUaDMobileBootstrap = try await request(
            "/api/mobile/clock",
            method: "POST",
            body: try encoder.encode(body)
        )
        guard let record = response.clockRecords?.first(where: { $0.type == "in" }) else {
            throw APIError.message("QUaD 主系统没有返回本次上班打卡记录")
        }
        return record.appShift(status: "ACTIVE")
    }

    func appendLocation(_ point: QueuedLocation) async throws -> LocationPoint {
        let body: [String: AnyEncodable] = [
            "latitude": .double(point.latitude), "longitude": .double(point.longitude),
            "accuracyM": .double(point.accuracyM), "collectedAt": .string(point.collectedAt),
            "clientPointId": .string(point.id.uuidString), "shiftId": .string(point.shiftId),
            "source": .string("OFFLINE_REPLAY"), "address": .string(point.address ?? "")
        ]
        return try await request("/api/field-sales/location-points", method: "POST", body: try encoder.encode(body))
    }

    func endShift(_ shiftId: String, location: CLLocationPayload?) async throws -> Shift {
        var body: [String: AnyEncodable] = [
            "type": .string("out"),
            "locationConsent": .bool(true)
        ]
        if let location {
            body["lat"] = .double(location.latitude)
            body["lng"] = .double(location.longitude)
            body["accuracy"] = .double(location.accuracy)
            body["note"] = .string(location.address ?? "")
        }
        let response: QUaDMobileBootstrap = try await request(
            "/api/mobile/clock",
            method: "POST",
            body: try encoder.encode(body)
        )
        guard let clockIn = response.clockRecords?.first(where: { $0.id == shiftId }) else {
            throw APIError.message("下班打卡已提交，但未找到对应的上班记录")
        }
        return clockIn.appShift(status: "ENDED")
    }

    func organizeVisit(planId: String, transcript: String, plan: VisitPlan) async throws -> AIVisitResult {
        let clean = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { throw APIError.message("会议原文为空") }
        return AIVisitResult(
            correctedTranscript: clean,
            organizedChinese: "客户：\(plan.customerName)\n拜访目标：\(plan.objective ?? "外勤拜访")\n语音记录：\(clean)"
        )
    }

    func uploadSegment(_ segment: RecordingSegment, data: Data) async throws {
        let name = "外勤-会议纪要语音-\(segment.createdAt.ISO8601Format()).m4a"
        let saved = try await uploadAttachment(
            objectId: segment.planId,
            fileName: name,
            contentType: "audio/mp4",
            data: data
        )
        let listed = try await attachments(objectId: segment.planId)
        guard listed.items.contains(where: { $0.attachmentId == saved.attachmentId && $0.sizeBytes == data.count }) else {
            throw APIError.message("服务器未确认完整语音分段")
        }
    }

    func uploadAttachment(
        objectId: String,
        fileName: String,
        contentType: String,
        data: Data,
        module: String = "sales-force"
    ) async throws -> UploadedAttachment {
        guard module == "sales-force" else { throw APIError.localOnly }
        let body: [String: AnyEncodable] = [
            "objectId": .string(objectId),
            "fileName": .string(fileName),
            "contentType": .string(contentType),
            "contentBase64": .string(data.base64EncodedString())
        ]
        let encodedObjectId = objectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? objectId
        return try await request(
            "/api/field-sales/attachments?objectId=\(encodedObjectId)",
            method: "POST",
            body: try encoder.encode(body)
        )
    }

    func attachments(objectId: String, module: String = "sales-force") async throws -> AttachmentList {
        guard module == "sales-force" else { throw APIError.localOnly }
        let encoded = objectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? objectId
        return try await request("/api/field-sales/attachments?objectId=\(encoded)")
    }

    func downloadAttachment(_ attachmentId: String, module: String) async throws -> Data {
        throw APIError.localOnly
    }

    func archiveAttachment(_ attachmentId: String, module: String) async throws -> AttachmentArchiveResponse {
        let encodedId = attachmentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? attachmentId
        let encodedModule = module.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? module
        return try await request(
            "/api/attachments/\(encodedId)?module=\(encodedModule)",
            method: "DELETE"
        )
    }

    private func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        authenticated: Bool = true,
        timeoutInterval: TimeInterval? = nil
    ) async throws -> T {
        guard Self.quadAllowedRequest(path: path, method: method) else {
            throw APIError.localOnly
        }
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.message("接口地址无效") }
        var request = URLRequest(url: url)
        if let timeoutInterval { request.timeoutInterval = timeoutInterval }
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authenticated {
            guard let token else { throw APIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("服务器响应无效") }
        guard 200..<300 ~= http.statusCode else {
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let detail = payload?["error"] as? String ?? payload?["detail"] as? String
            if http.statusCode == 401 {
                throw authenticated ? APIError.unauthorized : APIError.invalidCredentials
            }
            if http.statusCode == 409,
               payload?["code"] as? String == "ACTIVE_TRIP_EXISTS",
               let activeTripPayload = payload?["activeTrip"],
               JSONSerialization.isValidJSONObject(activeTripPayload),
               let activeTripData = try? JSONSerialization.data(withJSONObject: activeTripPayload),
               let activeTrip = try? decoder.decode(ActiveTripConflict.self, from: activeTripData) {
                throw APIError.activeTrip(activeTrip)
            }
            throw APIError.message(detail ?? "请求失败（\(http.statusCode)）")
        }
        return try decoder.decode(T.self, from: data)
    }

    private static func quadAllowedRequest(path: String, method: String) -> Bool {
        let verb = method.uppercased()
        let route = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        if verb == "DELETE", route.hasPrefix("/api/field-sales/visit-plans/") { return true }
        if verb == "PUT", route.hasPrefix("/api/field-sales/visits/"), route.hasSuffix("/complete") { return true }
        if verb == "PUT", route.hasPrefix("/api/field-sales/trips/"), route.hasSuffix("/cancel") { return true }
        if ["GET", "POST"].contains(verb), route == "/api/field-sales/attachments" { return true }
        return switch (verb, route) {
        case ("POST", "/api/login"),
             ("GET", "/api/mobile/bootstrap"),
             ("POST", "/api/mobile/clock"),
             ("GET", "/api/messages"),
             ("POST", "/api/messages"),
             ("PUT", "/api/messages/read"),
             ("POST", "/api/field-sales/accounts"),
             ("POST", "/api/field-sales/location-points"),
             ("POST", "/api/field-sales/visit-plans"),
             ("POST", "/api/field-sales/trips/start"),
             ("POST", "/api/field-sales/visits/start"),
             ("POST", "/api/field-sales/daily-reports"):
            true
        default:
            false
        }
    }

    static func localDate(_ date: Date = Date(), timeZoneIdentifier: String = TimeZone.current.identifier) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private struct QUaDMessageOverview: Decodable {
    let users: [QUaDMessageUser]
    let messages: [QUaDMessage]
    let unread: Int

    func appOverview(currentUserId: String) -> CollaborationOverview {
        CollaborationOverview(
            messages: messages.map { $0.appMessage(currentUserId: currentUserId) },
            users: users.map(\.appUser),
            unreadCount: unread
        )
    }
}

private struct QUaDMessageMutationResponse: Decodable {
    let messages: [QUaDMessage]
}

private struct QUaDMessageUser: Decodable {
    let id: String
    let name: String?
    let email: String?
    let department: String?
    let position: String?
    let avatarDataUrl: String?

    var appUser: InternalMessageUser {
        InternalMessageUser(
            userId: id,
            displayName: name,
            email: email,
            department: department,
            position: position,
            avatarAttachmentId: nil,
            avatarDataUrl: avatarDataUrl
        )
    }
}

private struct QUaDMessage: Decodable {
    let id: String
    let scope: String
    let groupId: String?
    let fromUserId: String
    let fromName: String?
    let toUserId: String
    let toName: String?
    let text: String
    let clientRequestId: String?
    let createdAt: String
    let readAt: String?
    let readByUserIds: [String]?

    func appMessage(currentUserId: String) -> InternalMessage {
        let incoming = fromUserId != currentUserId
        let read = scope == "group"
            ? (readByUserIds ?? []).contains(currentUserId)
            : !(readAt ?? "").isEmpty
        return InternalMessage(
            messageId: id,
            senderId: fromUserId,
            recipientId: scope == "group" ? (groupId ?? "all-staff") : toUserId,
            subject: "",
            content: text,
            status: read ? "READ" : "UNREAD",
            sentAt: createdAt,
            readAt: readAt,
            senderName: fromName,
            recipientName: toName,
            viewerStatus: incoming && !read ? "UNREAD" : "READ",
            received: incoming ? 1 : 0,
            attachments: []
        )
    }
}

private struct QUaDLoginResponse: Decodable {
    let token: String
    let user: QUaDUser
}

private struct QUaDMobileBootstrap: Decodable {
    let user: QUaDUser
    let clockRecords: [QUaDClockRecord]?
    let fieldSales: QUaDFieldSalesSnapshot

    func appDashboard(for date: String) -> FieldDashboard {
        let accountsById = Dictionary(uniqueKeysWithValues: fieldSales.accounts.map { ($0.id, $0) })
        let plans = (fieldSales.visitPlans ?? [])
            .filter { $0.date == date }
            .map { $0.appVisitPlan(account: accountsById[$0.accountId]) }
            .sorted {
                if ($0.routeSequence ?? 0) != ($1.routeSequence ?? 0) {
                    return ($0.routeSequence ?? 0) < ($1.routeSequence ?? 0)
                }
                return ($0.scheduledAt ?? "") < ($1.scheduledAt ?? "")
            }
        let datedClockRecords = (clockRecords ?? [])
            .filter { $0.date == date }
            .sorted { $0.at > $1.at }
        let activeShift: Shift? = datedClockRecords.first?.type == "in"
            ? datedClockRecords.first?.appShift(status: "ACTIVE")
            : nil
        let shifts = datedClockRecords
            .filter { $0.type == "in" }
            .map { record in
                record.appShift(status: activeShift?.shiftId == record.id ? "ACTIVE" : "ENDED")
            }
        return FieldDashboard(
            workDate: date,
            trackingIntervalSeconds: 300,
            activeShift: activeShift,
            shifts: shifts,
            todayCustomers: plans,
            route: (fieldSales.locationPoints ?? [])
                .filter { String($0.collectedAt.prefix(10)) == date }
                .map(\.appLocationPoint)
        )
    }
}

private struct QUaDVisitStartResponse: Decodable {
    let visit: QUaDFieldVisit
    let fieldSales: QUaDFieldSalesSnapshot
}

private struct QUaDFieldSalesSnapshot: Decodable {
    let enabled: Bool
    let accounts: [QUaDFieldSalesAccount]
    let visitPlans: [QUaDVisitPlan]?
    let locationPoints: [QUaDLocationPoint]?
    let visits: [QUaDFieldVisit]?

    func account(id: String) -> QUaDFieldSalesAccount? {
        accounts.first { $0.id == id }
    }

    func requiredPlan(id: String, accountId: String) throws -> VisitPlan {
        guard let plan = visitPlans?.first(where: { $0.id == id })
                ?? visitPlans?.first(where: { $0.accountId == accountId }) else {
            throw APIError.message("QUaD 主系统没有返回更新后的拜访计划")
        }
        return plan.appVisitPlan(account: account(id: plan.accountId))
    }
}

private struct QUaDFieldVisit: Decodable {
    let id: String
    let accountId: String
    let status: String
}

private struct QUaDClockRecord: Decodable {
    let id: String
    let type: String
    let at: String
    let date: String
    let address: String?

    func appShift(status: String) -> Shift {
        Shift(
            shiftId: id,
            status: status,
            clockInServerAt: at,
            clockInAddress: address
        )
    }
}

private struct QUaDLocationPoint: Decodable {
    let locationId: String?
    let clientPointId: String
    let collectedAt: String
    let latitude: Double
    let longitude: Double
    let accuracyM: Double

    var appLocationPoint: LocationPoint {
        LocationPoint(
            locationId: locationId,
            clientPointId: clientPointId,
            collectedAt: collectedAt,
            latitude: latitude,
            longitude: longitude,
            accuracyM: accuracyM
        )
    }
}

private struct QUaDVisitPlan: Decodable {
    let id: String
    let accountId: String
    let businessName: String
    let address: String?
    let date: String
    let plannedAt: String?
    let order: Double?
    let status: String
    let note: String?
    let cancelReason: String?
    let tripId: String?
    let visitId: String?

    func appVisitPlan(account: QUaDFieldSalesAccount?) -> VisitPlan {
        VisitPlan(
            planId: id,
            planCode: id,
            customerId: accountId,
            customerName: businessName,
            contactName: account?.contactName,
            phone: account?.phone,
            scheduledAt: plannedAt,
            address: address ?? account?.address,
            latitude: account?.lat,
            longitude: account?.lng,
            objective: note,
            routeSequence: order,
            status: appStatus,
            cancellationReason: cancelReason
        )
    }

    private var appStatus: String {
        switch status {
        case "已完成": "COMPLETED"
        case "已取消": "CANCELLED"
        case "前往中": "TRAVELING"
        case "拜访中", "进行中": "IN_PROGRESS"
        default: "PLANNED"
        }
    }
}

private struct QUaDUser: Decodable {
    let id: String
    let name: String?
    let email: String?
    let role: String?
    let defaultBranchId: String?

    var appUser: UserProfile {
        UserProfile(
            userId: id,
            loginName: email,
            displayName: name,
            email: email,
            roles: role.map { [$0] },
            regionCode: "US",
            currencyCode: "USD",
            distanceUnit: "miles",
            timeZone: "America/Los_Angeles",
            mapProvider: "appleMaps",
            documentLanguage: "zh",
            defaultCity: defaultBranchId == "las-vegas" ? "Las Vegas, NV" : "Los Angeles, CA",
            defaultStartAddress: defaultBranchId == "las-vegas" ? "Las Vegas, NV" : "Los Angeles, CA",
            warehouseNames: ["洛杉矶仓", "拉斯维加斯仓"],
            department: "销售部",
            position: "业务员"
        )
    }
}

private struct QUaDFieldSalesAccount: Decodable {
    let id: String
    let businessName: String
    let address: String
    let contactName: String?
    let phone: String?
    let email: String?
    let city: String?
    let customerType: String?
    let source: String?
    let note: String?
    let assignedUserName: String?
    let createdByUserId: String?
    let updatedAt: String?
    let lat: Double?
    let lng: Double?

    var appCustomer: CustomerSummary {
        CustomerSummary(
            customerId: id,
            customerCode: id,
            customerName: businessName,
            customerType: customerType ?? "",
            email: email ?? "",
            phone: phone ?? "",
            address: address,
            contactName: contactName ?? "",
            sourceChannel: source ?? "",
            owner: assignedUserName ?? "",
            createdByUserId: createdByUserId,
            mainProducts: note ?? "",
            updatedAt: updatedAt ?? "",
            latitude: lat,
            longitude: lng,
            distanceMiles: nil,
            travelMinutes: nil
        )
    }
}

private struct QUaDCreateCustomerRequest: Encodable {
    let businessName: String
    let address: String
    let city: String
    let phone: String
    let email: String
    let customerType: String
    let source: String
    let contactName: String
    let note: String
    let language: String
}

struct UploadedAttachment: Decodable {
    let attachmentId: String
    let url: String?
}
private struct UserAccountUpdateRequest: Encodable {
    let displayName: String
    let roles: [String]
    let department: String
    let position: String
}
private struct PasswordChangeRequest: Encodable {
    let currentPassword: String
    let newPassword: String
}
struct PasswordChangeResponse: Decodable {
    let passwordChanged: Bool
    let signInRequired: Bool
}
struct CLLocationPayload {
    let latitude: Double
    let longitude: Double
    let accuracy: Double
    let address: String?
}
struct AIVisitResult: Decodable {
    let correctedTranscript: String?
    let organizedChinese: String
}

enum APIError: LocalizedError {
    case unauthorized
    case invalidCredentials
    case localOnly
    case activeTrip(ActiveTripConflict)
    case message(String)
    var errorDescription: String? {
        switch self {
        case .unauthorized: "登录已失效，请重新登录"
        case .invalidCredentials: "员工邮箱或密码不正确"
        case .localOnly: "此功能按要求保留原界面，目前只在本机使用，尚未连接 QUaD 主系统"
        case .activeTrip(let trip): "您正在前往 \(trip.businessName)，请先完成或放弃上一段行程"
        case .message(let value):
            if isCustomerCodeConflict { "客户编号已存在，系统已自动生成新编号，请重新保存" }
            else if isActiveShiftConflict { "服务器确认当前已经上班，正在恢复上班状态" }
            else { value }
        }
    }

    var isCustomerCodeConflict: Bool {
        guard case .message(let value) = self else { return false }
        let normalized = value.lowercased()
        return normalized.contains("customer code") && normalized.contains("already exists")
            || normalized.contains("客户编号") && normalized.contains("存在")
    }

    var isActiveShiftConflict: Bool {
        guard case .message(let value) = self else { return false }
        let normalized = value.lowercased()
        return normalized.contains("shift") && (normalized.contains("already") || normalized.contains("active"))
            || normalized.contains("已经上班") || normalized.contains("活动班次")
    }
}

enum AnyEncodable: Encodable {
    case string(String), double(Double), bool(Bool), int(Int), array([AnyEncodable])
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        }
    }
}
