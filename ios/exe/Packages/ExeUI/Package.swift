// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ExeUI",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "ExeUI", targets: ["ExeUI"])
    ],
    dependencies: [
        .package(path: "../ExeDomain")
    ],
    targets: [
        .target(
            name: "ExeUI",
            dependencies: ["ExeDomain"]
        )
    ]
)
