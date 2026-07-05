import ExeDomain
import Foundation

extension Bundle {
    var exeEnvironment: ExeEnvironment {
        bundleIdentifier?.hasSuffix(".dev") == true ? .dev : .prod
    }
}
