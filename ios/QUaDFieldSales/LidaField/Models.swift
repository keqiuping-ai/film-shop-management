import Foundation

enum InterfaceLanguage: String, CaseIterable, Identifiable, Codable, Sendable {
    case simplifiedChinese = "zh-Hans"
    case english = "en"

    static let storageKey = "quad.interface-language"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }
    var displayName: String {
        switch self {
        case .simplifiedChinese: "中文"
        case .english: "English"
        }
    }

    static var saved: InterfaceLanguage {
        guard let value = UserDefaults.standard.string(forKey: storageKey),
              let language = InterfaceLanguage(rawValue: value) else {
            return .simplifiedChinese
        }
        return language
    }
}

struct CapturedPhotoEvidence: Identifiable {
    let id: UUID
    let data: Data
    let capturedAt: Date
    let latitude: Double
    let longitude: Double
    let accuracyM: Double
    let address: String?
    let distanceToCustomerM: Double?

    var coordinateText: String {
        String(format: "%.5f, %.5f", latitude, longitude)
    }
}

struct PhotoEvidenceManifest: Encodable {
    let evidenceId: UUID
    let source: String
    let category: String
    let customerName: String
    let capturedAt: String
    let latitude: Double
    let longitude: Double
    let accuracyM: Double
    let address: String?
    let positioningMethod: String
    let distanceToCustomerM: Double?
    let imageFileName: String
}

struct LoginResponse: Decodable {
    let accessToken: String
    let user: UserProfile
}

struct UserProfile: Codable {
    let userId: String?
    let loginName: String?
    let displayName: String?
    let email: String?
    let roles: [String]?
    let regionCode: String?
    let currencyCode: String?
    let distanceUnit: String?
    let timeZone: String?
    let mapProvider: String?
    let documentLanguage: String?
    let defaultCity: String?
    let defaultStartAddress: String?
    let warehouseNames: [String]?
    let department: String?
    let position: String?
}

enum AppRegion: String, Codable, Sendable {
    case unitedStates = "US"
    case china = "CN"
}

enum RegionalDistanceUnit: String, Codable, Sendable {
    case miles
    case kilometers
}

enum RegionalMapProvider: String, Codable, Sendable {
    case appleMaps
    case amap

    var displayName: String {
        switch self {
        case .appleMaps: "Apple 地图"
        case .amap: "高德地图"
        }
    }
}

struct RegionalConfiguration: Codable, Equatable, Sendable {
    let region: AppRegion
    let localeIdentifier: String
    let currencyCode: String
    let distanceUnit: RegionalDistanceUnit
    let timeZoneIdentifier: String
    let mapProvider: RegionalMapProvider
    let documentLanguage: String
    let defaultCity: String
    let defaultStartAddress: String
    let warehouseNames: [String]

    static let unitedStates = RegionalConfiguration(
        region: .unitedStates,
        localeIdentifier: "en_US",
        currencyCode: "USD",
        distanceUnit: .miles,
        timeZoneIdentifier: "America/Los_Angeles",
        mapProvider: .appleMaps,
        documentLanguage: "en",
        defaultCity: "Los Angeles, CA",
        defaultStartAddress: "Los Angeles, CA",
        warehouseNames: ["洛杉矶仓", "拉斯维加斯仓"]
    )

    static let china = RegionalConfiguration(
        region: .china,
        localeIdentifier: "zh_CN",
        currencyCode: "CNY",
        distanceUnit: .kilometers,
        timeZoneIdentifier: "Asia/Shanghai",
        mapProvider: .amap,
        documentLanguage: "zh",
        defaultCity: "中国",
        defaultStartAddress: "中国",
        warehouseNames: ["中国仓库"]
    )

    /// Use the employee's actual operating time zone when the account does not
    /// yet carry a business-region profile. Keep the app's Chinese language and
    /// business defaults independent from the calendar time zone: an employee
    /// working in the United States may still use Chinese speech recognition,
    /// CNY documents and the Chinese interface.
    static var deviceFallback: RegionalConfiguration {
        let identifier = TimeZone.autoupdatingCurrent.identifier
        return configuration(base: .china, user: nil, timeZoneIdentifier: identifier)
    }

    static func resolve(
        user: UserProfile?,
        explicitRegionCode: String? = nil
    ) -> RegionalConfiguration {
        let requestedRegion = (explicitRegionCode ?? user?.regionCode ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        let requestedTimeZone = (user?.timeZone ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let base: RegionalConfiguration
        if requestedRegion == AppRegion.unitedStates.rawValue {
            base = .unitedStates
        } else if requestedRegion == AppRegion.china.rawValue {
            base = .china
        } else {
            base = .china
        }
        return configuration(
            base: base,
            user: user,
            timeZoneIdentifier: TimeZone(identifier: requestedTimeZone) == nil
                ? TimeZone.autoupdatingCurrent.identifier
                : requestedTimeZone
        )
    }

    private static func configuration(
        base: RegionalConfiguration,
        user: UserProfile?,
        timeZoneIdentifier: String
    ) -> RegionalConfiguration {
        RegionalConfiguration(
            region: base.region,
            localeIdentifier: base.localeIdentifier,
            currencyCode: user?.currencyCode?.isEmpty == false ? user!.currencyCode! : base.currencyCode,
            distanceUnit: RegionalDistanceUnit(rawValue: user?.distanceUnit ?? "") ?? base.distanceUnit,
            timeZoneIdentifier: timeZoneIdentifier,
            mapProvider: RegionalMapProvider(rawValue: user?.mapProvider ?? "") ?? base.mapProvider,
            documentLanguage: user?.documentLanguage?.isEmpty == false ? user!.documentLanguage! : base.documentLanguage,
            defaultCity: user?.defaultCity?.isEmpty == false ? user!.defaultCity! : base.defaultCity,
            defaultStartAddress: user?.defaultStartAddress?.isEmpty == false ? user!.defaultStartAddress! : base.defaultStartAddress,
            warehouseNames: user?.warehouseNames?.isEmpty == false ? user!.warehouseNames! : base.warehouseNames
        )
    }

    var locale: Locale { Locale(identifier: localeIdentifier) }
    var timeZone: TimeZone { TimeZone(identifier: timeZoneIdentifier) ?? .current }
    var countryCode: String { region.rawValue }
    var isChina: Bool { region == .china }
    var regionDisplayName: String { isChina ? "中国" : "美国" }
    var phonePlaceholder: String { isChina ? "中国手机号，例如 138 0000 0000" : "美国电话，例如 (310) 555-0182" }
    var addressPlaceholder: String { isChina ? "省 / 市 / 区 / 街道 / 门牌号" : "Street, City, State, ZIP" }
    var documentDisplayName: String { documentLanguage == "en" ? "英文业务单据" : "中文业务单据" }
    var paymentMethods: [String] {
        isChina ? ["微信支付", "支付宝", "银行转账", "现金"] : ["信用卡", "现金", "银行转账"]
    }
    var deliveryMethods: [String] {
        isChina ? ["送货上门", "门店自提", "物流配送"] : ["Delivery", "Customer Pickup", "Freight"]
    }

    func localized(us: String, cn: String) -> String { isChina ? cn : us }

    func mapSearchURL(query: String) -> URL? {
        var components = URLComponents()
        if mapProvider == .amap {
            components.scheme = "https"
            components.host = "uri.amap.com"
            components.path = "/search"
            components.queryItems = [
                URLQueryItem(name: "keyword", value: query),
                URLQueryItem(name: "city", value: defaultCity),
                URLQueryItem(name: "src", value: "lida-field-ios"),
                URLQueryItem(name: "callnative", value: "1")
            ]
        } else {
            components.scheme = "https"
            components.host = "maps.apple.com"
            components.queryItems = [URLQueryItem(name: "q", value: query)]
        }
        return components.url
    }

    func formatCurrency(_ amount: Double) -> String {
        amount.formatted(
            .currency(code: currencyCode)
            .locale(locale)
            .precision(.fractionLength(0...2))
        )
    }

    func formatDistance(miles: Double, fractionDigits: Int = 1) -> String {
        let value = distanceUnit == .miles ? miles : miles * 1.609_344
        let number = value.formatted(
            .number
            .locale(locale)
            .precision(.fractionLength(fractionDigits))
        )
        return distanceUnit == .miles ? "\(number) mi" : "\(number) 公里"
    }

    func formatDate(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle(date: .long, time: .omitted, locale: locale, timeZone: timeZone)
        )
    }

    func formatTime(_ iso8601: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso8601) else { return iso8601 }
        return date.formatted(
            Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, timeZone: timeZone)
        )
    }

    var distanceFilterOptionsMiles: [(label: String, miles: Double)] {
        if distanceUnit == .miles {
            return [(formatDistance(miles: 5, fractionDigits: 0), 5),
                    (formatDistance(miles: 10, fractionDigits: 0), 10),
                    (formatDistance(miles: 20, fractionDigits: 0), 20)]
        }
        return [5.0, 10.0, 20.0].map { kilometers in
            ("\(Int(kilometers)) 公里内", kilometers / 1.609_344)
        }
    }
}

struct AppVersionPolicy: Codable, Equatable, Sendable {
    let minimumVersion: String
    let latestVersion: String
    let updateURL: String
    let releaseNotes: String?
    let distribution: String?
}

enum AppVersionState: Equatable {
    case checking
    case current
    case optionalUpdate(AppVersionPolicy)
    case requiredUpdate(AppVersionPolicy)
    case notConfigured

    var blocksWrites: Bool {
        if case .requiredUpdate = self { return true }
        return false
    }

    var isChecking: Bool {
        if case .checking = self { return true }
        return false
    }
}

struct FieldDashboard: Decodable {
    let workDate: String
    let trackingIntervalSeconds: Int
    let activeShift: Shift?
    let shifts: [Shift]
    let todayCustomers: [VisitPlan]
    let route: [LocationPoint]
}

struct Shift: Codable, Identifiable {
    let shiftId: String
    let status: String
    let clockInServerAt: String
    let clockInAddress: String?
    var id: String { shiftId }
}

struct VisitPlan: Codable, Identifiable, Hashable {
    let planId: String
    let planCode: String?
    let customerId: String?
    let customerName: String
    let contactName: String?
    let phone: String?
    let scheduledAt: String?
    let address: String?
    let latitude: Double?
    let longitude: Double?
    let objective: String?
    let routeSequence: Double?
    let status: String
    let cancellationReason: String?
    var id: String { planId }
}

/// One customer in the visit-planning workflow. The date, time, and order are
/// intentionally stored per customer so a single plan can span several days.
struct VisitScheduleDraft: Identifiable, Hashable {
    let customer: CustomerSummary
    var scheduledAt: Date
    var sequence: Int

    var id: String { customer.id }
}

struct MeetingDraft: Codable, Equatable {
    var transcript: String = ""
    var aiResult: String = ""
    var updatedAt: Date = Date()
}

struct LocationPoint: Codable, Identifiable {
    let locationId: String?
    let clientPointId: String
    let collectedAt: String
    let latitude: Double
    let longitude: Double
    let accuracyM: Double
    var id: String { locationId ?? clientPointId }
}

struct AttachmentList: Decodable {
    let items: [AttachmentItem]
}

struct AttachmentItem: Decodable, Identifiable {
    let attachmentId: String
    let fileName: String
    let sizeBytes: Int
    let contentType: String?
    var id: String { attachmentId }
}

struct AttachmentArchiveResponse: Decodable {
    let attachmentId: String
    let status: String
}

struct VisitPlanDeleteResponse: Decodable {
    let recordId: String
    let status: String
}

struct ActiveTripConflict: Decodable, Identifiable, Equatable {
    let id: String
    let accountId: String
    let businessName: String
    let status: String
    let departedAt: String
    let destination: ActiveTripDestination?

    struct ActiveTripDestination: Decodable, Equatable {
        let address: String?
    }
}

struct CollaborationOverview: Decodable {
    let messages: [InternalMessage]
    let users: [InternalMessageUser]
    let unreadCount: Int
}

struct InternalMessageUser: Decodable, Identifiable, Hashable {
    let userId: String
    let displayName: String?
    let email: String?
    let department: String?
    let position: String?
    let avatarAttachmentId: String?
    let avatarDataUrl: String?

    var id: String { userId }
    var resolvedName: String { displayName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? displayName! : (email ?? userId) }

    init(
        userId: String,
        displayName: String?,
        email: String?,
        department: String?,
        position: String?,
        avatarAttachmentId: String?,
        avatarDataUrl: String? = nil
    ) {
        self.userId = userId
        self.displayName = displayName
        self.email = email
        self.department = department
        self.position = position
        self.avatarAttachmentId = avatarAttachmentId
        self.avatarDataUrl = avatarDataUrl
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
        case avatarAttachmentId = "avatar_attachment_id"
        case avatarDataUrl = "avatar_data_url"
        case email, department, position
    }


    var inlineAvatarData: Data? {
        guard let avatarDataUrl,
              avatarDataUrl.hasPrefix("data:image/"),
              let comma = avatarDataUrl.firstIndex(of: ",") else { return nil }
        let encoded = String(avatarDataUrl[avatarDataUrl.index(after: comma)...])
        return Data(base64Encoded: encoded, options: .ignoreUnknownCharacters)
    }
}

struct InternalMessageAttachment: Decodable, Identifiable, Hashable {
    let attachmentId: String
    let fileName: String
    let contentType: String
    let sizeBytes: Int

    var id: String { attachmentId }

    enum CodingKeys: String, CodingKey {
        case attachmentId = "attachment_id"
        case fileName = "file_name"
        case contentType = "content_type"
        case sizeBytes = "size_bytes"
    }
}

struct InternalMessage: Decodable, Identifiable, Hashable {
    let messageId: String
    let senderId: String
    let recipientId: String
    let subject: String
    let content: String
    let status: String
    let sentAt: String
    let readAt: String?
    let senderName: String?
    let recipientName: String?
    let viewerStatus: String?
    let received: Int?
    let attachments: [InternalMessageAttachment]

    var id: String { messageId }

    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case senderId = "sender_id"
        case recipientId = "recipient_id"
        case subject, content, status
        case sentAt = "sent_at"
        case readAt = "read_at"
        case senderName = "sender_name"
        case recipientName = "recipient_name"
        case viewerStatus = "viewer_status"
        case received, attachments
    }
}

enum ChatMediaKind: String, Sendable {
    case voice
    case image
    case file

    var label: String {
        switch self {
        case .voice: "语音"
        case .image: "图片"
        case .file: "文件"
        }
    }
}

struct ChatMediaDraft: Sendable {
    let kind: ChatMediaKind
    let data: Data
    let fileName: String
    let contentType: String
    let duration: TimeInterval?
}

enum PendingInternalMessageStatus: Sendable {
    case sending
    case failed(String)
}

struct PendingInternalMessage: Identifiable, Sendable {
    let id: String
    let recipientId: String
    let subject: String
    let content: String
    let media: ChatMediaDraft?
    let queuedAt: Date
    var status: PendingInternalMessageStatus
}

struct InternalMessageSendResponse: Decodable {
    let messageId: String
    let status: String
}

struct ExpenseClaimCreateResponse: Decodable {
    let claimId: String
    let claimCode: String
    let status: String
}

struct ExpenseClaimSubmitResponse: Decodable {
    let claimId: String
    let status: String
}

struct RecordingSegment: Codable, Identifiable {
    let id: UUID
    let planId: String
    let relativePath: String
    let createdAt: Date
    var byteCount: Int
    var attempts: Int
    var lastError: String? = nil
}

struct QueuedLocation: Codable, Identifiable {
    let id: UUID
    let shiftId: String
    let collectedAt: String
    let latitude: Double
    let longitude: Double
    let accuracyM: Double
    let address: String?
}

struct CustomerListResponse: Decodable {
    let items: [CustomerSummary]
}

struct CustomerSummary: Codable, Identifiable, Hashable {
    let customerId: String
    let customerCode: String
    let customerName: String
    let customerType: String
    let email: String
    let phone: String
    let address: String
    let contactName: String
    let sourceChannel: String
    let owner: String
    var createdByUserId: String? = nil
    let mainProducts: String
    let updatedAt: String
    var latitude: Double? = nil
    var longitude: Double? = nil
    var distanceMiles: Double?
    var travelMinutes: Int?

    var id: String { customerId }
    var cityLabel: String {
        let parts = address.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count > 1 { return parts[parts.count - 2] }
        if let cityEnd = address.firstIndex(of: "市") {
            return String(address[...cityEnd])
        }
        return "未填写城市"
    }
}

struct CustomerDraft: Encodable {
    var customerCode = CustomerDraft.makeCustomerCode()
    var customerName = ""
    var address = ""
    var phone = ""
    var email = ""
    var customerType = "贴膜门店"
    var sourceChannel = "业务员发现"
    var contactName = ""
    var contactTitle = ""
    var notes = ""
    var countryCode = ""

    /// The current customer API has one contact-name column but no separate
    /// title column. Keep the native form fields independent and preserve both
    /// values in the existing server field until the API adds contactTitle.
    var contactDisplayName: String {
        [contactName, contactTitle]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    static func makeCustomerCode() -> String {
        "MOB-\(String(UUID().uuidString.prefix(12)).uppercased())"
    }

    enum CodingKeys: String, CodingKey {
        case customerCode, customerName, customerType, email, phone, country
        case contactName, sourceChannel, address, mainProducts
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(customerCode, forKey: .customerCode)
        try container.encode(customerName, forKey: .customerName)
        try container.encode(customerType, forKey: .customerType)
        try container.encode(email, forKey: .email)
        try container.encode(phone, forKey: .phone)
        try container.encode(countryCode, forKey: .country)
        try container.encode(contactDisplayName, forKey: .contactName)
        try container.encode(sourceChannel, forKey: .sourceChannel)
        try container.encode(address.trimmingCharacters(in: .whitespacesAndNewlines), forKey: .address)
        try container.encode(notes, forKey: .mainProducts)
    }
}

struct VisitProductLine: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var sku: String
    var unit: String
    var quantity: Double
    var unitPrice: Double
    var discount: Double

    init(
        id: UUID = UUID(),
        name: String,
        sku: String,
        unit: String = "卷",
        quantity: Double,
        unitPrice: Double,
        discount: Double = 0
    ) {
        self.id = id
        self.name = name
        self.sku = sku
        self.unit = unit
        self.quantity = quantity
        self.unitPrice = unitPrice
        self.discount = discount
    }

    var amount: Double { max(0, quantity * unitPrice - discount) }
}

struct VisitArtifact: Encodable {
    let kind: String
    let customerName: String
    let createdAt: String
    let values: [String: String]
    let products: [VisitProductLine]
}

struct SalesForceRecord: Decodable {
    let recordId: String
    let status: String
}

struct SalesForceOverview: Decodable {
    let plans: [SalesForceRecordEnvelope]
    let activities: [SalesForceRecordEnvelope]
}

struct SalesForceRecordEnvelope: Decodable, Identifiable {
    let recordId: String
    let recordCode: String
    let recordName: String
    let customerId: String
    let owner: String
    let status: String
    let payload: [String: JSONValue]
    var id: String { recordId }
}

enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

enum DesignPreviewPage: String, CaseIterable, Hashable {
    case home = "01"
    case newCustomer = "02"
    case customers = "03"
    case planCustomers = "04"
    case planSchedule = "05"
    case today = "06"
    case execution = "07"
    case photos = "08"
    case meeting = "09"
    case samples = "10"
    case order = "11"
    case receipt = "12"
    case followUp = "13"
    case completion = "14"
    case report = "15"
    case nearby = "16"
}

enum PreviewData {
    static let user = UserProfile(
        userId: "preview-user", loginName: "chrissie", displayName: "Chrissie 万卉",
        email: "sales@example.com", roles: ["sales_representative"],
        regionCode: "US", currencyCode: "USD", distanceUnit: "miles",
        timeZone: "America/Los_Angeles", mapProvider: "appleMaps",
        documentLanguage: "en", defaultCity: "Los Angeles, CA",
        defaultStartAddress: "Los Angeles, CA",
        warehouseNames: ["洛杉矶仓", "拉斯维加斯仓"],
        department: "销售部", position: "业务员"
    )

    static let customers: [CustomerSummary] = [
        CustomerSummary(
            customerId: "customer-sunset", customerCode: "CUS-001", customerName: "Sunset Auto Tint",
            customerType: "贴膜门店", email: "david@sunsettint.example", phone: "(310) 555-0182",
            address: "1458 W Sunset Blvd, Los Angeles, CA", contactName: "David",
            sourceChannel: "Google 客户", owner: "Chrissie 万卉", mainProducts: "汽车陶瓷隔热膜",
            updatedAt: "2026-08-28T09:30:00Z", distanceMiles: 2.4, travelMinutes: 12
        ),
        CustomerSummary(
            customerId: "customer-west", customerCode: "CUS-002", customerName: "West Coast Wrap",
            customerType: "汽车改色店", email: "", phone: "(310) 555-0282",
            address: "2810 Santa Monica Blvd, Santa Monica, CA", contactName: "Kevin",
            sourceChannel: "业务员发现", owner: "Chrissie 万卉", mainProducts: "汽车改色膜",
            updatedAt: "2026-08-27T15:20:00Z", distanceMiles: 6.8, travelMinutes: 21
        ),
        CustomerSummary(
            customerId: "customer-ocean", customerCode: "CUS-003", customerName: "Ocean Auto Detail",
            customerType: "汽车美容店", email: "", phone: "", address: "Lincoln Blvd, Santa Monica, CA",
            contactName: "", sourceChannel: "Yelp 客户", owner: "Chrissie 万卉", mainProducts: "汽车美容",
            updatedAt: "2026-08-26T11:00:00Z", distanceMiles: 8.1, travelMinutes: 27
        ),
        CustomerSummary(
            customerId: "customer-la", customerCode: "CUS-004", customerName: "LA Premium Wrap",
            customerType: "汽车改色店", email: "", phone: "", address: "W Olympic Blvd, Los Angeles, CA",
            contactName: "Lina", sourceChannel: "客户介绍", owner: "Chrissie 万卉", mainProducts: "高端汽车改色膜",
            updatedAt: "2026-08-25T10:00:00Z", distanceMiles: 9.7, travelMinutes: 31
        )
    ]

    static let chinaCustomers: [CustomerSummary] = [
        CustomerSummary(
            customerId: "customer-sunset", customerCode: "CUS-CN-001", customerName: "上海虹桥汽车贴膜中心",
            customerType: "贴膜门店", email: "sales@example.cn", phone: "138 0000 0182",
            address: "上海市闵行区申长路 988 号", contactName: "陈经理",
            sourceChannel: "高德客户", owner: "Chrissie 万卉", mainProducts: "汽车陶瓷隔热膜",
            updatedAt: "2026-08-28T09:30:00+08:00", distanceMiles: 1.5, travelMinutes: 12
        ),
        CustomerSummary(
            customerId: "customer-west", customerCode: "CUS-CN-002", customerName: "浦东车衣改色工坊",
            customerType: "汽车改色店", email: "", phone: "139 0000 0282",
            address: "上海市浦东新区张江路 88 号", contactName: "王经理",
            sourceChannel: "业务员发现", owner: "Chrissie 万卉", mainProducts: "汽车改色膜",
            updatedAt: "2026-08-27T15:20:00+08:00", distanceMiles: 4.2, travelMinutes: 21
        ),
        CustomerSummary(
            customerId: "customer-ocean", customerCode: "CUS-CN-003", customerName: "静安汽车美容店",
            customerType: "汽车美容店", email: "", phone: "", address: "上海市静安区共和新路 1688 号",
            contactName: "", sourceChannel: "门店拜访", owner: "Chrissie 万卉", mainProducts: "汽车美容",
            updatedAt: "2026-08-26T11:00:00+08:00", distanceMiles: 5.0, travelMinutes: 27
        ),
        CustomerSummary(
            customerId: "customer-la", customerCode: "CUS-CN-004", customerName: "徐汇高端改色中心",
            customerType: "汽车改色店", email: "", phone: "", address: "上海市徐汇区龙吴路 600 号",
            contactName: "李经理", sourceChannel: "客户介绍", owner: "Chrissie 万卉", mainProducts: "高端汽车改色膜",
            updatedAt: "2026-08-25T10:00:00+08:00", distanceMiles: 6.0, travelMinutes: 31
        )
    ]

    static let jiujiangCustomers: [CustomerSummary] = [
        CustomerSummary(
            customerId: "preview-jiujiang-wanda", customerCode: "PREVIEW-JJ-001", customerName: "万达店",
            customerType: "贴膜门店", email: "", phone: "138 0000 0001",
            address: "江西省九江市濂溪区万达广场", contactName: "董总",
            sourceChannel: "业务员发现", owner: "预览账号", mainProducts: "汽车贴膜",
            updatedAt: "2026-08-29T21:40:00+08:00", distanceMiles: nil, travelMinutes: nil
        ),
        CustomerSummary(
            customerId: "preview-jiujiang-wrap", customerCode: "PREVIEW-JJ-002", customerName: "万达贴膜",
            customerType: "贴膜门店", email: "", phone: "138 0000 0002",
            address: "江西省九江市庐山国际贴膜门店", contactName: "可经理",
            sourceChannel: "名片现场拍照", owner: "预览账号", mainProducts: "车衣和隔热膜",
            updatedAt: "2026-08-29T22:10:00+08:00", distanceMiles: nil, travelMinutes: nil
        )
    ]

    static let plans: [VisitPlan] = [
        VisitPlan(
            planId: "plan-sunset", planCode: "PLAN-001", customerId: "customer-sunset",
            customerName: "Sunset Auto Tint", contactName: "David", phone: "(310) 555-0182",
            scheduledAt: "2026-08-28T10:30:00-07:00", address: "1458 W Sunset Blvd, Los Angeles, CA",
            latitude: 34.0777, longitude: -118.2606, objective: "首次拜访并确认 QD15 试用",
            routeSequence: 2, status: "PLANNED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-la", planCode: "PLAN-002", customerId: "customer-la",
            customerName: "LA Premium Wrap", contactName: "Lina", phone: "",
            scheduledAt: "2026-08-28T09:00:00-07:00", address: "W Olympic Blvd, Los Angeles, CA",
            latitude: 34.0522, longitude: -118.2437, objective: "重点客户回访",
            routeSequence: 1, status: "COMPLETED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-west", planCode: "PLAN-003", customerId: "customer-west",
            customerName: "West Coast Wrap", contactName: "Kevin", phone: "(310) 555-0282",
            scheduledAt: "2026-08-28T13:30:00-07:00", address: "2810 Santa Monica Blvd, Santa Monica, CA",
            latitude: 34.0242, longitude: -118.4965, objective: "30 天未访客户回访",
            routeSequence: 3, status: "PLANNED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-ocean", planCode: "PLAN-004", customerId: "customer-ocean",
            customerName: "Ocean Auto Detail", contactName: nil, phone: nil,
            scheduledAt: "2026-08-28T15:00:00-07:00", address: "Lincoln Blvd, Santa Monica, CA",
            latitude: 34.0095, longitude: -118.4973, objective: "首次拜访",
            routeSequence: 4, status: "PLANNED", cancellationReason: nil
        )
    ]

    static let chinaPlans: [VisitPlan] = [
        VisitPlan(
            planId: "plan-sunset", planCode: "PLAN-CN-001", customerId: "customer-sunset",
            customerName: "上海虹桥汽车贴膜中心", contactName: "陈经理", phone: "138 0000 0182",
            scheduledAt: "2026-08-28T10:30:00+08:00", address: "上海市闵行区申长路 988 号",
            latitude: 31.1979, longitude: 121.3264, objective: "首次拜访并确认 QD15 试用",
            routeSequence: 2, status: "PLANNED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-la", planCode: "PLAN-CN-002", customerId: "customer-la",
            customerName: "徐汇高端改色中心", contactName: "李经理", phone: "",
            scheduledAt: "2026-08-28T09:00:00+08:00", address: "上海市徐汇区龙吴路 600 号",
            latitude: 31.1702, longitude: 121.4558, objective: "重点客户回访",
            routeSequence: 1, status: "COMPLETED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-west", planCode: "PLAN-CN-003", customerId: "customer-west",
            customerName: "浦东车衣改色工坊", contactName: "王经理", phone: "139 0000 0282",
            scheduledAt: "2026-08-28T13:30:00+08:00", address: "上海市浦东新区张江路 88 号",
            latitude: 31.2012, longitude: 121.6047, objective: "30 天未访客户回访",
            routeSequence: 3, status: "PLANNED", cancellationReason: nil
        ),
        VisitPlan(
            planId: "plan-ocean", planCode: "PLAN-CN-004", customerId: "customer-ocean",
            customerName: "静安汽车美容店", contactName: nil, phone: nil,
            scheduledAt: "2026-08-28T15:00:00+08:00", address: "上海市静安区共和新路 1688 号",
            latitude: 31.2782, longitude: 121.4557, objective: "首次拜访",
            routeSequence: 4, status: "PLANNED", cancellationReason: nil
        )
    ]

    static let dashboard = FieldDashboard(
        workDate: "2026-08-28", trackingIntervalSeconds: 300,
        activeShift: Shift(
            shiftId: "shift-preview", status: "ACTIVE",
            clockInServerAt: "2026-08-28T08:48:00-07:00", clockInAddress: "Los Angeles, CA"
        ),
        shifts: [], todayCustomers: plans, route: []
    )

    static let chinaDashboard = FieldDashboard(
        workDate: "2026-08-28", trackingIntervalSeconds: 300,
        activeShift: Shift(
            shiftId: "shift-preview-cn", status: "ACTIVE",
            clockInServerAt: "2026-08-28T08:48:00+08:00", clockInAddress: "上海市闵行区"
        ),
        shifts: [], todayCustomers: chinaPlans, route: []
    )

    static let internalUsers: [InternalMessageUser] = [
        .init(userId: "manager-li", displayName: "李经理", email: "manager@example.com", department: "销售部", position: "销售经理", avatarAttachmentId: nil),
        .init(userId: "finance-wang", displayName: "王会计", email: "finance@example.com", department: "财务部", position: "会计", avatarAttachmentId: nil),
        .init(userId: "service-team", displayName: "客服小组", email: "service@example.com", department: "客户服务部", position: "客服", avatarAttachmentId: nil)
    ]

    static let internalMessages: [InternalMessage] = [
        .init(
            messageId: "msg-preview-1", senderId: "manager-li", recipientId: "preview-user",
            subject: "今日客户跟进", content: "今天完成拜访后，请把 QD15 样品反馈发到工作日报。",
            status: "READ", sentAt: "2026-08-28T09:18:00+08:00", readAt: "2026-08-28T09:20:00+08:00",
            senderName: "李经理", recipientName: "Chrissie 万卉", viewerStatus: "READ", received: 1, attachments: []
        ),
        .init(
            messageId: "msg-preview-2", senderId: "preview-user", recipientId: "manager-li",
            subject: "今日客户跟进", content: "收到，我会在下班前提交完整日报。",
            status: "READ", sentAt: "2026-08-28T09:22:00+08:00", readAt: nil,
            senderName: "Chrissie 万卉", recipientName: "李经理", viewerStatus: nil, received: 0, attachments: []
        ),
        .init(
            messageId: "msg-preview-3", senderId: "finance-wang", recipientId: "preview-user",
            subject: "报销资料提醒", content: "报销时请上传清晰的发票或付款凭证。",
            status: "UNREAD", sentAt: "2026-08-28T11:36:00+08:00", readAt: nil,
            senderName: "王会计", recipientName: "Chrissie 万卉", viewerStatus: "UNREAD", received: 1, attachments: []
        ),
        .init(
            messageId: "msg-preview-4", senderId: "service-team", recipientId: "__ALL__",
            subject: "系统通知", content: "新版员工 App 已增加站内信息、请假和报销入口。",
            status: "UNREAD", sentAt: "2026-08-28T12:05:00+08:00", readAt: nil,
            senderName: "客服小组", recipientName: "全体员工群聊", viewerStatus: "UNREAD", received: 1, attachments: []
        )
    ]

    static func customers(for region: RegionalConfiguration) -> [CustomerSummary] {
        region.isChina ? chinaCustomers : customers
    }

    static func dashboard(for region: RegionalConfiguration) -> FieldDashboard {
        region.isChina ? chinaDashboard : dashboard
    }
}
