import Foundation

public enum APIError: Error, LocalizedError, Sendable {
    case badRequest(message: String)
    case decodingFailed(underlying: any Error)
    case forbidden
    case networkError(underlying: any Error)
    case notFound
    case serverError(statusCode: Int)
    case unauthorized

    public var errorDescription: String? {
        switch self {
            case let .badRequest(message):
                message
            case let .decodingFailed(error):
                "Failed to decode response: \(error.localizedDescription)"
            case .forbidden:
                "You do not have access to this workspace."
            case let .networkError(error):
                error.localizedDescription
            case .notFound:
                "The requested resource was not found."
            case let .serverError(statusCode):
                "Server error: \(statusCode)"
            case .unauthorized:
                "Sign in is required."
        }
    }
}
