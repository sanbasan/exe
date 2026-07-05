// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ExeAPIClient",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "ExeAPIClient", targets: ["ExeAPIClient"])
    ],
    dependencies: [
        .package(path: "../ExeDomain"),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")
    ],
    targets: [
        .target(
            name: "ExeAPIClient",
            dependencies: [
                "ExeDomain",
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk")
            ]
        )
    ]
)
