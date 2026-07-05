import Foundation

public enum HTTPMethod: String, Sendable {
    case delete = "DELETE"
    case get = "GET"
    case patch = "PATCH"
    case post = "POST"
    case put = "PUT"
}

public struct Endpoint<Response: Decodable & Sendable>: Sendable {
    public let body: (any Encodable & Sendable)?
    public let method: HTTPMethod
    public let path: String
    public let queryItems: [URLQueryItem]

    public init(
        path: String,
        method: HTTPMethod = .get,
        body: (any Encodable & Sendable)? = nil,
        queryItems: [URLQueryItem] = []
    ) {
        self.body = body
        self.method = method
        self.path = path
        self.queryItems = queryItems
    }

    func urlRequest(baseURL: URL) throws -> URLRequest {
        var components = URLComponents(
            url: baseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        )
        if !queryItems.isEmpty {
            components?.queryItems = queryItems
        }
        guard let url = components?.url else {
            throw APIError.networkError(underlying: URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        if let body {
            request.httpBody = try JSONEncoder.exe.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
}

extension JSONEncoder {
    static var exe: JSONEncoder {
        JSONEncoder()
    }
}

extension JSONDecoder {
    static var exe: JSONDecoder {
        JSONDecoder()
    }
}
