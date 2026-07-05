import Foundation

public actor APIClient {
    private let authProvider: AuthProvider
    private let baseURL: URL
    private let session: URLSession

    public init(
        baseURL: URL,
        authProvider: AuthProvider,
        session: URLSession = .shared
    ) {
        self.authProvider = authProvider
        self.baseURL = baseURL
        self.session = session
    }

    public func request<Response: Decodable & Sendable>(
        _ endpoint: Endpoint<Response>
    ) async throws -> Response {
        var request = try endpoint.urlRequest(baseURL: baseURL)
        let token = try await authProvider.currentIdToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(underlying: URLError(.badServerResponse))
        }
        if httpResponse.statusCode == 401 {
            return try await retry(endpoint)
        }
        return try decode(data, response: httpResponse)
    }

    private func retry<Response: Decodable & Sendable>(
        _ endpoint: Endpoint<Response>
    ) async throws -> Response {
        var request = try endpoint.urlRequest(baseURL: baseURL)
        let token = try await authProvider.refreshIdToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        return try decode(data, response: response)
    }
}

public actor UnauthenticatedAPIClient {
    private let baseURL: URL
    private let session: URLSession

    public init(
        baseURL: URL,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
    }

    public func request<Response: Decodable & Sendable>(
        _ endpoint: Endpoint<Response>
    ) async throws -> Response {
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let (data, response) = try await session.data(for: request)
        return try decode(data, response: response)
    }
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let message: String
    }

    let error: Body?
    let message: String?
}

private func decode<Response: Decodable>(
    _ data: Data,
    response: URLResponse
) throws -> Response {
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.networkError(underlying: URLError(.badServerResponse))
    }

    switch httpResponse.statusCode {
        case 200 ... 299:
            do {
                return try JSONDecoder.exe.decode(Response.self, from: data)
            } catch {
                throw APIError.decodingFailed(underlying: error)
            }
        case 400:
            throw APIError.badRequest(message: errorMessage(from: data) ?? "Bad request")
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        default:
            throw APIError.serverError(statusCode: httpResponse.statusCode)
    }
}

private func errorMessage(from data: Data) -> String? {
    let envelope = try? JSONDecoder.exe.decode(ErrorEnvelope.self, from: data)
    return envelope?.error?.message ?? envelope?.message
}
