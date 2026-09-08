import Foundation
import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case chinese = "zh"
    case english = "en"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: self == .chinese ? "zh_CN" : "en_US") }

    func text(_ key: TextKey) -> String {
        switch (self, key) {
        case (.chinese, .appName): "QUaD 业务员"
        case (.english, .appName): "QUaD Field Sales"
        case (.chinese, .email): "邮箱"
        case (.english, .email): "Email"
        case (.chinese, .password): "密码"
        case (.english, .password): "Password"
        case (.chinese, .signIn): "登录"
        case (.english, .signIn): "Sign In"
        case (.chinese, .signingIn): "正在登录…"
        case (.english, .signingIn): "Signing In…"
        case (.chinese, .messages): "信息"
        case (.english, .messages): "Messages"
        case (.chinese, .business): "业务"
        case (.english, .business): "Business"
        case (.chinese, .me): "我的"
        case (.english, .me): "Me"
        case (.chinese, .businessCenter): "业务员管理中心"
        case (.english, .businessCenter): "Field Sales Center"
        case (.chinese, .businessSubtitle): "客户 · 计划 · 拜访 · 总结"
        case (.english, .businessSubtitle): "Customers · Plans · Visits · Reports"
        case (.chinese, .inventoryPricing): "库存与报价"
        case (.english, .inventoryPricing): "Inventory & Pricing"
        case (.chinese, .inventoryPricingSubtitle): "查询可用库存和已授权价格"
        case (.english, .inventoryPricingSubtitle): "Check available stock and authorized pricing"
        case (.chinese, .inventorySearchPrompt): "输入 SKU、型号、规格或产品名称"
        case (.english, .inventorySearchPrompt): "Enter SKU, model, specification, or product name"
        case (.chinese, .search): "搜索"
        case (.english, .search): "Search"
        case (.chinese, .searching): "正在搜索…"
        case (.english, .searching): "Searching…"
        case (.chinese, .searchHint): "只显示后台授权给你的库存和价格。"
        case (.english, .searchHint): "Only inventory and price tiers authorized for your account are shown."
        case (.chinese, .noResults): "没有找到匹配的产品"
        case (.english, .noResults): "No matching products"
        case (.chinese, .availableInventory): "可用库存"
        case (.english, .availableInventory): "Available Inventory"
        case (.chinese, .authorizedPricing): "授权报价"
        case (.english, .authorizedPricing): "Authorized Pricing"
        case (.chinese, .lasVegasWarehouse): "拉斯维加斯仓库"
        case (.english, .lasVegasWarehouse): "Las Vegas Warehouse"
        case (.chinese, .losAngelesWarehouse): "洛杉矶仓库"
        case (.english, .losAngelesWarehouse): "Los Angeles Warehouse"
        case (.chinese, .wholesalePrice): "批发价"
        case (.english, .wholesalePrice): "Wholesale Price"
        case (.chinese, .firstOrderPrice): "首次进货价"
        case (.english, .firstOrderPrice): "First-order Price"
        case (.chinese, .bronzePrice): "铜牌价"
        case (.english, .bronzePrice): "Bronze Price"
        case (.chinese, .silverPrice): "银牌价"
        case (.english, .silverPrice): "Silver Price"
        case (.chinese, .goldPrice): "金牌价"
        case (.english, .goldPrice): "Gold Price"
        case (.chinese, .strategicPrice): "超级战略合作伙伴价"
        case (.english, .strategicPrice): "Strategic Partner Price"
        case (.chinese, .priceUnavailable): "暂无价格"
        case (.english, .priceUnavailable): "Price unavailable"
        case (.chinese, .noInventoryPermission): "当前账号没有库存与报价查看权限"
        case (.english, .noInventoryPermission): "Your account is not authorized to view inventory or pricing"
        case (.chinese, .networkError): "网络连接失败，请稍后重试"
        case (.english, .networkError): "Network connection failed. Please try again."
        case (.chinese, .sessionExpired): "登录已失效，请重新登录"
        case (.english, .sessionExpired): "Your session expired. Please sign in again."
        case (.chinese, .invalidCredentials): "邮箱或密码不正确"
        case (.english, .invalidCredentials): "Incorrect email or password"
        case (.chinese, .language): "语言"
        case (.english, .language): "Language"
        case (.chinese, .chinese): "中文"
        case (.english, .chinese): "Chinese"
        case (.chinese, .english): "英文"
        case (.english, .english): "English"
        case (.chinese, .signOut): "退出登录"
        case (.english, .signOut): "Sign Out"
        case (.chinese, .welcome): "欢迎回来"
        case (.english, .welcome): "Welcome back"
        case (.chinese, .messagePlaceholder): "员工消息将在下一阶段接入"
        case (.english, .messagePlaceholder): "Staff messaging will be connected in the next phase"
        case (.chinese, .customer): "客户"
        case (.english, .customer): "Customers"
        case (.chinese, .todayVisits): "今日拜访"
        case (.english, .todayVisits): "Today's Visits"
        case (.chinese, .clock): "上下班打卡"
        case (.english, .clock): "Clock In & Out"
        case (.chinese, .comingNext): "下一阶段接入"
        case (.english, .comingNext): "Coming in the next phase"
        }
    }
}
enum TextKey {
    case appName, email, password, signIn, signingIn
    case messages, business, me, businessCenter, businessSubtitle
    case inventoryPricing, inventoryPricingSubtitle, inventorySearchPrompt
    case search, searching, searchHint, noResults, availableInventory, authorizedPricing
    case lasVegasWarehouse, losAngelesWarehouse
    case wholesalePrice, firstOrderPrice, bronzePrice, silverPrice, goldPrice, strategicPrice
    case priceUnavailable, noInventoryPermission, networkError, sessionExpired, invalidCredentials
    case language, chinese, english, signOut, welcome, messagePlaceholder
    case customer, todayVisits, clock, comingNext
}

private struct AppLanguageKey: EnvironmentKey {
    static let defaultValue: AppLanguage = .chinese
}

extension EnvironmentValues {
    var appLanguage: AppLanguage {
        get { self[AppLanguageKey.self] }
        set { self[AppLanguageKey.self] = newValue }
    }
}
