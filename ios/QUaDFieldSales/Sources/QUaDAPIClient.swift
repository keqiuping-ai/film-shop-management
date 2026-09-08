import Foundation

actor QUaDAPIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private var token: String?

    init(baseURL: URL = QUaDAPIClient.configuredBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    static var configuredBaseURL: URL {
        let configured = Bundle.main.object(forInfoDictionaryKey: "QUAD_API_BASE_URL") as? String
        return URL(string: configured ?? "http://127.0.0.1:3000")!
    }

    func setToken(_ token: String?) {
        self.token = token
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        struct LoginBody: Encodable { let email: String; let password: String }
        let response: LoginResponse = try await request(
            "/api/login",
            method: "POST",
            body: LoginBody(email: email, password: password),
            authenticated: false
        )
        token = response.token
        return response
    }

    func bootstrap() async throws -> MobileBootstrap {
        try await request("/api/mobile/bootstrap")
    }

    func inventoryPricing(query: String) async throws -> InventoryPricingResponse {
        var components = URLComponents()
        components.path = "/api/field-sales/inventory-pricing"
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let path = components.string else { throw QUaDAPIError.invalidURL }
        return try await request(path)
    }

    private func request<Response: Decodable, Body: Encodable>(
        _ path: String,
        method: String = "GET",
        body: Body? = Optional<EmptyBody>.none,
        authenticated: Bool = true
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw QUaDAPIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let token else { throw QUaDAPIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { request.httpBody = try encoder.encode(body) }

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw QUaDAPIError.invalidResponse }
            guard 200..<300 ~= http.statusCode else {
                let payload = try? decoder.decode(APIErrorPayload.self, from: data)
                if http.statusCode == 401 {
                    throw authenticated ? QUaDAPIError.unauthorized : QUaDAPIError.invalidCredentials
                }
                if http.statusCode == 403,
                   payload?.code == "FIELD_SALES_INVENTORY_PRICING_FORBIDDEN" {
                    throw QUaDAPIError.inventoryPricingForbidden
                }
                throw QUaDAPIError.server(code: payload?.code, message: payload?.error)
            }
            return try decoder.decode(Response.self, from: data)
        } catch let error as QUaDAPIError {
            throw error
        } catch let error as DecodingError {
            throw QUaDAPIError.decoding(error)
        } catch {
            throw QUaDAPIError.network(error)
        }
    }

    private func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        authenticated: Bool = true
    ) async throws -> Response {
        try await request(path, method: method, body: Optional<EmptyBody>.none, authenticated: authenticated)
    }
}

private struct EmptyBody: Encodable {}
private struct APIErrorPayload: Decodable { let error: String?; let code: String? }

enum QUaDAPIError: Error {
    case invalidURL
    case invalidResponse
    case unauthorized
    case invalidCredentials
    case inventoryPricingForbidden
    case server(code: String?, message: String?)
    case decoding(Error)
    case network(Error)
}
