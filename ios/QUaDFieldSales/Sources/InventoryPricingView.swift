import SwiftUI

@MainActor
private final class InventoryPricingModel: ObservableObject {
    @Published var query = ""
    @Published private(set) var products: [InventoryPricingProduct] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasSearched = false
    @Published var error: QUaDAPIError?

    func search(using api: QUaDAPIClient) async {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, !isLoading else { return }
        isLoading = true
        hasSearched = true
        products = []
        error = nil
        defer { isLoading = false }
        do {
            let response = try await api.inventoryPricing(query: normalized)
            products = response.products
        } catch {
            self.error = error as? QUaDAPIError ?? .network(error)
        }
    }
}

struct InventoryPricingView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appLanguage) private var language
    @StateObject private var model = InventoryPricingModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    TextField(language.text(.inventorySearchPrompt), text: $model.query)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .onSubmit { Task { await model.search(using: session.api) } }
                    Button(language.text(.search)) {
                        Task { await model.search(using: session.api) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isLoading)
                }

                Text(language.text(.searchHint))
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if model.isLoading {
                    HStack { ProgressView(); Text(language.text(.searching)) }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 28)
                } else if let error = model.error {
                    ErrorCard(message: localized(error))
                } else if model.hasSearched && model.products.isEmpty {
                    ContentUnavailableView(
                        language.text(.noResults),
                        systemImage: "magnifyingglass",
                        description: Text(model.query)
                    )
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(model.products) { product in
                            InventoryPricingCard(product: product)
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(language.text(.inventoryPricing))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func localized(_ error: QUaDAPIError) -> String {
        switch error {
        case .inventoryPricingForbidden: language.text(.noInventoryPermission)
        case .unauthorized: language.text(.sessionExpired)
        case .invalidCredentials: language.text(.invalidCredentials)
        case .server: language.text(.networkError)
        default: language.text(.networkError)
        }
    }
}

private struct ErrorCard: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct InventoryPricingCard: View {
    @Environment(\.appLanguage) private var language
    let product: InventoryPricingProduct

    private var displayName: String {
        if language == .english {
            return [product.name, product.model, product.specification, product.sku]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first { !$0.isEmpty && !$0.containsHanScript } ?? product.sku
        }
        return product.name.isEmpty ? product.model : product.name
    }

    private var subtitle: String {
        [product.model, product.specification]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter {
                !$0.isEmpty && $0 != product.sku && $0 != displayName &&
                (language != .english || !$0.containsHanScript)
            }
            .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("SKU · \(product.sku)").font(.caption.monospaced()).foregroundStyle(.secondary)
                Text(displayName).font(.headline)
                if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
            }

            if let inventory = product.inventory {
                Divider()
                Text(language.text(.availableInventory)).font(.subheadline.bold())
                InventoryRow(
                    label: language.text(.lasVegasWarehouse),
                    value: quantity(inventory["las-vegas"] ?? 0)
                )
                InventoryRow(
                    label: language.text(.losAngelesWarehouse),
                    value: quantity(inventory["los-angeles"] ?? 0)
                )
            }

            if let prices = product.prices, !prices.isEmpty {
                Divider()
                Text(language.text(.authorizedPricing)).font(.subheadline.bold())
                ForEach(PriceTier.allCases.filter { prices.keys.contains($0.rawValue) }, id: \.rawValue) { tier in
                    InventoryRow(
                        label: language.text(tier.labelKey),
                        value: price(prices[tier.rawValue] ?? nil)
                    )
                }
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(.quaternary) }
    }

    private func quantity(_ value: Double) -> String {
        let number = value.formatted(.number.precision(.fractionLength(0...2)).locale(language.locale))
        let unit = product.unit.trimmingCharacters(in: .whitespacesAndNewlines)
        let visibleUnit = language == .english && unit.containsHanScript ? "" : unit
        return visibleUnit.isEmpty ? number : "\(number) \(visibleUnit)"
    }

    private func price(_ value: Double?) -> String {
        guard let value, value > 0 else { return language.text(.priceUnavailable) }
        return value.formatted(.currency(code: "USD").locale(language.locale).precision(.fractionLength(0...2)))
    }
}

private extension String {
    var containsHanScript: Bool {
        range(of: "\\p{Han}", options: .regularExpression) != nil
    }
}

private struct InventoryRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.semibold)
        }
        .font(.subheadline)
    }
}
