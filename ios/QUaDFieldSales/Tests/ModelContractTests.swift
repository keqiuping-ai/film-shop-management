import Foundation

@main
enum ModelContractTests {
    static func main() throws {
        try permissionsRequireFieldSalesAccess()
        try inventoryResponseDoesNotInventFields()
        try translationsCoverInventorySurface()
        print("QUaDFieldSales model and localization contract tests passed.")
    }

    private static func permissionsRequireFieldSalesAccess() throws {
        var permissions = StaffPermissions()
        permissions.fieldSalesInventoryView = true
        try require(!permissions.canViewInventoryPricing, "inventory permission alone must not bypass field-sales access")
        permissions.fieldSalesView = true
        try require(permissions.canViewInventoryPricing, "authorized field-sales user should see inventory entry")

        var pricingOnly = StaffPermissions()
        pricingOnly.fieldSalesEdit = true
        pricingOnly.fieldSalesPriceSilver = true
        try require(pricingOnly.canViewInventoryPricing, "authorized silver pricing should show the entry")
    }

    private static func inventoryResponseDoesNotInventFields() throws {
        let inventoryOnly = #"{"query":"QD15","access":{"inventory":true,"priceTierIds":[]},"products":[{"sku":"QD15","name":"QD15","model":"QD15","specification":"","unit":"roll","inventory":{"las-vegas":4,"los-angeles":7}}]}"#
        let decoded = try JSONDecoder().decode(InventoryPricingResponse.self, from: Data(inventoryOnly.utf8))
        try require(decoded.products.first?.inventory?["las-vegas"] == 4, "Las Vegas inventory must decode")
        try require(decoded.products.first?.prices == nil, "missing unauthorized prices must remain absent")

        let pricesOnly = #"{"query":"QD15","access":{"inventory":false,"priceTierIds":["silver","gold"]},"products":[{"sku":"QD15","name":"QD15","model":"QD15","specification":"","unit":"roll","prices":{"silver":325,"gold":300}}]}"#
        let pricing = try JSONDecoder().decode(InventoryPricingResponse.self, from: Data(pricesOnly.utf8))
        try require(pricing.products.first?.inventory == nil, "missing unauthorized inventory must remain absent")
        try require(pricing.products.first?.prices?["silver"] == 325, "authorized silver price must decode")
        try require(pricing.products.first?.prices?["standard"] == nil, "unauthorized wholesale price must remain absent")
    }

    private static func translationsCoverInventorySurface() throws {
        let keys: [TextKey] = [
            .inventoryPricing, .inventoryPricingSubtitle, .inventorySearchPrompt, .search,
            .searching, .searchHint, .noResults, .availableInventory, .authorizedPricing,
            .lasVegasWarehouse, .losAngelesWarehouse, .wholesalePrice, .firstOrderPrice,
            .bronzePrice, .silverPrice, .goldPrice, .strategicPrice, .priceUnavailable,
            .noInventoryPermission
        ]
        for key in keys {
            let zh = AppLanguage.chinese.text(key)
            let en = AppLanguage.english.text(key)
            try require(!zh.isEmpty && !en.isEmpty && zh != en, "inventory translation is incomplete")
        }
    }

    private static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw TestFailure(message: message) }
    }
}

private struct TestFailure: Error, CustomStringConvertible {
    let message: String
    var description: String { message }
}
