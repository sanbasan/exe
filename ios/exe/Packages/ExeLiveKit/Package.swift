// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ExeLiveKit",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "ExeLiveKit", targets: ["ExeLiveKit"])
    ],
    dependencies: [
        .package(path: "../ExeDomain"),
        .package(url: "https://github.com/livekit/client-sdk-swift.git", from: "2.0.0")
    ],
    targets: [
        .target(
            name: "ExeLiveKit",
            dependencies: [
                "ExeDomain",
                .product(name: "LiveKit", package: "client-sdk-swift")
            ]
        )
    ]
)
