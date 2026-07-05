import ExeDomain
import FirebaseAuth
import FirebaseCore
import Foundation

public actor AuthService: AuthProvider {
    private let apiClient: UnauthenticatedAPIClient

    public init(baseURL: URL) {
        self.apiClient = UnauthenticatedAPIClient(baseURL: baseURL)
    }

    public func sendCode(
        email: String,
        language: Language = .preferredForAppLocalization()
    ) async throws {
        struct Request: Encodable, Sendable {
            let email: String
            let language: Language
        }
        struct Response: Decodable, Sendable {
            let sent: Bool
        }

        let endpoint = Endpoint<Response>(
            path: "/api/v1/auth/send-code",
            method: .post,
            body: Request(email: email, language: language)
        )
        _ = try await apiClient.request(endpoint)
    }

    public func verifyCode(
        email: String,
        code: String
    ) async throws -> String {
        struct Request: Encodable, Sendable {
            let code: String
            let email: String
        }
        struct Response: Decodable, Sendable {
            let customToken: String
        }

        let response = try await apiClient.request(
            Endpoint<Response>(
                path: "/api/v1/auth/verify-code",
                method: .post,
                body: Request(code: code, email: email)
            )
        )
        return response.customToken
    }

    public func signIn(customToken: String) async throws {
        try await Auth.auth().signIn(withCustomToken: customToken)
    }

    public func signOut() throws {
        try Auth.auth().signOut()
    }

    public func currentIdToken() async throws -> String {
        guard let user = Auth.auth().currentUser else {
            throw APIError.unauthorized
        }
        return try await user.getIDToken()
    }

    public func refreshIdToken() async throws -> String {
        guard let user = Auth.auth().currentUser else {
            throw APIError.unauthorized
        }
        return try await user.getIDToken(forcingRefresh: true)
    }

    public nonisolated var isSignedIn: Bool {
        Auth.auth().currentUser != nil
    }

    public nonisolated func addAuthStateListener(
        _ handler: @escaping @Sendable (_ isSignedIn: Bool) -> Void
    ) {
        Auth.auth().addStateDidChangeListener { _, user in
            handler(user != nil)
        }
    }

    public static func configure() {
        FirebaseApp.configure()
    }
}
