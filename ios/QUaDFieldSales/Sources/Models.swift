import Foundation

struct StaffPermissions: Codable, Equatable {
    var fieldSalesView = false
    var fieldSalesEdit = false
    var fieldSalesManage = false
    var fieldSalesInventoryView = false
    var fieldSalesPriceWholesale = false
    var fieldSalesPriceFirstOrder = false
    var fieldSalesPriceBronze = false
    var fieldSalesPriceSilver = false
    var fieldSalesPriceGold = false
    var fieldSalesPriceStrategic = false

    var canUseFieldSales: Bool { fieldSalesView || fieldSalesEdit || fieldSalesManage }
    var canViewInventoryPricing: Bool {
        canUseFieldSales && (
            fieldSalesInventoryView || fieldSalesPriceWholesale || fieldSalesPriceFirstOrder ||
            fieldSalesPriceBronze || fieldSalesPriceSilver || fieldSalesPriceGold ||
            fieldSalesPriceStrategic
        )
    }
}

struct StaffUser: Codable, Equatable, Identifiable {
    let id: String
    let name: String?
    let email: String
    let role: String
    let permissions: StaffPermissions

    var displayName: String { name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? email }
}

struct LoginResponse: Decodable {
    let token: String
    let user: StaffUser
}

struct MobileBootstrap: Decodable {
    let user: StaffUser
}

struct InventoryPricingAccess: Decodable, Equatable {
    let inventory: Bool
    let priceTierIds: [String]
}

struct InventoryPricingResponse: Decodable, Equatable {
    let query: String
    let access: InventoryPricingAccess
    let products: [InventoryPricingProduct]
}

struct InventoryPricingProduct: Decodable, Equatable, Identifiable {
    var id: String { sku }
    let sku: String
    let name: String
    let model: String
    let specification: String
    let unit: String
    let inventory: [String: Double]?
    let prices: [String: Double?]?
}

enum PriceTier: String, CaseIterable {
    case standard
    case firstOrder = "first-order"
    case bronze
    case silver
    case gold
    case strategic

    var labelKey: TextKey {
        switch self {
        case .standard: .wholesalePrice
        case .firstOrder: .firstOrderPrice
        case .bronze: .bronzePrice
        case .silver: .silverPrice
        case .gold: .goldPrice
        case .strategic: .strategicPrice
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
