.PHONY: lint format-check format build test quality resolve

SCHEME = exe-dev
PROJECT = exe.xcodeproj
DESTINATION = platform=iOS Simulator,name=iPhone 17 Pro,OS=latest

lint:
	swiftlint --strict --config .swiftlint.yml

format-check:
	swiftformat --lint --config .swiftformat exe/ Packages/

format:
	swiftformat --config .swiftformat exe/ Packages/

build:
	xcodebuild build \
		-project $(PROJECT) \
		-scheme $(SCHEME) \
		-destination "$(DESTINATION)" \
		-disableAutomaticPackageResolution \
		-skipPackagePluginValidation \
		CODE_SIGNING_ALLOWED=NO

test:
	xcodebuild test \
		-project $(PROJECT) \
		-scheme $(SCHEME) \
		-destination "$(DESTINATION)" \
		-disableAutomaticPackageResolution \
		-skipPackagePluginValidation \
		CODE_SIGNING_ALLOWED=NO

resolve:
	xcodebuild -resolvePackageDependencies \
		-project $(PROJECT) \
		-scheme $(SCHEME)

quality: lint format-check build
