import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appLanguage) private var language
    @Binding var languageCode: String

    var body: some View {
        Group {
            if session.isRestoring {
                ProgressView()
            } else if session.user == nil {
                LoginView(languageCode: $languageCode)
            } else {
                MainShellView(languageCode: $languageCode)
            }
        }
    }
}
private struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appLanguage) private var language
    @Binding var languageCode: String
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(language.text(.email), text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                    SecureField(language.text(.password), text: $password)
                        .textContentType(.password)
                } header: {
                    Text(language.text(.appName))
                }

                if let message = session.localizedError(language) {
                    Text(message).foregroundStyle(.red)
                }

                Button {
                    Task {
                        _ = await session.signIn(
                            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                            password: password
                        )
                        password = ""
                    }
                } label: {
                    HStack {
                        Spacer()
                        if session.isSigningIn { ProgressView().padding(.trailing, 6) }
                        Text(language.text(session.isSigningIn ? .signingIn : .signIn))
                        Spacer()
                    }
                }
                .disabled(session.isSigningIn || email.isEmpty || password.isEmpty)
            }
            .navigationTitle(language.text(.appName))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    LanguageMenu(languageCode: $languageCode)
                }
            }
        }
    }
}

private struct MainShellView: View {
    @Environment(\.appLanguage) private var language
    @Binding var languageCode: String

    var body: some View {
        TabView {
            NavigationStack { MessagesView() }
                .tabItem { Label(language.text(.messages), systemImage: "message.fill") }
            NavigationStack { BusinessHomeView() }
                .tabItem { Label(language.text(.business), systemImage: "briefcase.fill") }
            NavigationStack { MyView(languageCode: $languageCode) }
                .tabItem { Label(language.text(.me), systemImage: "person.fill") }
        }
        .tint(.teal)
    }
}

private struct MessagesView: View {
    @Environment(\.appLanguage) private var language

    var body: some View {
        ContentUnavailableView(
            language.text(.messages),
            systemImage: "message.fill",
            description: Text(language.text(.messagePlaceholder))
        )
        .navigationTitle(language.text(.messages))
    }
}

private struct BusinessHomeView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appLanguage) private var language

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("QUaD FIELD SALES")
                        .font(.caption.bold()).tracking(1.3)
                    Text(language.text(.businessCenter)).font(.largeTitle.bold())
                    Text(language.text(.businessSubtitle)).font(.title3)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(22)
                .background(
                    LinearGradient(colors: [.teal.opacity(0.9), .cyan.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 24)
                )

                LazyVGrid(columns: columns, spacing: 12) {
                    PlaceholderBusinessTile(title: language.text(.customer), icon: "person.2.fill")
                    PlaceholderBusinessTile(title: language.text(.todayVisits), icon: "location.fill")
                    PlaceholderBusinessTile(title: language.text(.clock), icon: "clock.fill")

                    if session.user?.permissions.canViewInventoryPricing == true {
                        NavigationLink {
                            InventoryPricingView()
                        } label: {
                            BusinessTile(
                                title: language.text(.inventoryPricing),
                                subtitle: language.text(.inventoryPricingSubtitle),
                                icon: "shippingbox.fill",
                                color: .blue
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding()
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(language.text(.business))
    }
}

private struct PlaceholderBusinessTile: View {
    @Environment(\.appLanguage) private var language
    let title: String
    let icon: String

    var body: some View {
        BusinessTile(title: title, subtitle: language.text(.comingNext), icon: icon, color: .teal)
    }
}

private struct BusinessTile: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon)
                .font(.title2.bold())
                .foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(color, in: RoundedRectangle(cornerRadius: 13))
            Text(title).font(.headline).foregroundStyle(.primary)
            Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
        .padding()
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct MyView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.appLanguage) private var language
    @Binding var languageCode: String

    var body: some View {
        Form {
            Section(language.text(.welcome)) {
                LabeledContent(language.text(.email), value: session.user?.email ?? "")
            }
            Section(language.text(.language)) {
                Picker(language.text(.language), selection: $languageCode) {
                    Text(language.text(.chinese)).tag(AppLanguage.chinese.rawValue)
                    Text(language.text(.english)).tag(AppLanguage.english.rawValue)
                }
                .pickerStyle(.segmented)
            }
            Button(language.text(.signOut), role: .destructive) { session.signOut() }
        }
        .navigationTitle(language.text(.me))
    }
}

private struct LanguageMenu: View {
    @Environment(\.appLanguage) private var language
    @Binding var languageCode: String

    var body: some View {
        Menu {
            Picker(language.text(.language), selection: $languageCode) {
                Text(language.text(.chinese)).tag(AppLanguage.chinese.rawValue)
                Text(language.text(.english)).tag(AppLanguage.english.rawValue)
            }
        } label: {
            Image(systemName: "globe")
        }
        .accessibilityLabel(language.text(.language))
    }
}
