import SwiftUI

@main
struct QUaDFieldSalesApp: App {
    @StateObject private var session = SessionStore()
    @AppStorage("quad.fieldSales.language") private var languageCode = AppLanguage.chinese.rawValue

    private var language: AppLanguage { AppLanguage(rawValue: languageCode) ?? .chinese }

    var body: some Scene {
        WindowGroup {
            RootView(languageCode: $languageCode)
                .environmentObject(session)
                .environment(\.appLanguage, language)
                .environment(\.locale, language.locale)
                .task { await session.restore() }
        }
    }
}
