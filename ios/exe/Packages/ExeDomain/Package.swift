// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ExeDomain",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "ExeDomain", targets: ["ExeDomain"])
    ],
    targets: [
        .target(name: "ExeDomain")
    ]
)
