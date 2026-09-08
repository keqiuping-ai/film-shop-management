import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var user: StaffUser?
    @Published private(set) var isRestoring = true
    @Published private(set) var isSigningIn = false
    @Published var error: QUaDAPIError?

    let api: QUaDAPIClient

    init(api: QUaDAPIClient = QUaDAPIClient()) {
        self.api = api
    }

    func restore() async {
        defer { isRestoring = false }
        guard let token = TokenStore.load() else { return }
        await api.setToken(token)
        do {
            user = try await api.bootstrap().user
        } catch {
            if case QUaDAPIError.unauthorized = error {
                TokenStore.delete()
                await api.setToken(nil)
            }
            self.error = error as? QUaDAPIError ?? .network(error)
        }
    }

    func signIn(email: String, password: String) async -> Bool {
        guard !isSigningIn else { return false }
        isSigningIn = true
        error = nil
        defer { isSigningIn = false }
        do {
            let response = try await api.login(email: email, password: password)
            try TokenStore.save(response.token)
            user = try await api.bootstrap().user
            return true
        } catch {
            self.error = error as? QUaDAPIError ?? .network(error)
            return false
        }
    }

    func signOut() {
        TokenStore.delete()
        Task { await api.setToken(nil) }
        user = nil
        error = nil
    }

    func localizedError(_ language: AppLanguage) -> String? {
        guard let error else { return nil }
        return switch error {
        case .unauthorized: language.text(.sessionExpired)
        case .invalidCredentials: language.text(.invalidCredentials)
        case .inventoryPricingForbidden: language.text(.noInventoryPermission)
        case .server: language.text(.networkError)
        case .invalidURL, .invalidResponse, .decoding, .network: language.text(.networkError)
        }
    }
}
