public protocol AuthProvider: Sendable {
    func currentIdToken() async throws -> String

    func refreshIdToken() async throws -> String
}
