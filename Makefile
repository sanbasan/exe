.PHONY: app-build app-check deploy-dev deploy-prod deploy-web-dev deploy-web-prod ios-quality quality

# Project ids come from .firebaserc (copy .firebaserc.example and fill in your
# Firebase project ids).
DEV_PROJECT := $(shell node -p "require('./.firebaserc').projects.dev" 2>/dev/null)
PROD_PROJECT := $(shell node -p "require('./.firebaserc').projects.prod" 2>/dev/null)

app-build:
	npm --prefix app run build:all

app-check:
	npm --prefix app run check

ios-quality:
	$(MAKE) -C ios/exe quality

quality: app-check app-build ios-quality

# App Hosting selects app/apphosting.<env>.yaml via the backend's configured
# environment name (set in the Firebase console), so no file switching is needed.
deploy-dev: quality
	@$(MAKE) deploy-firebase-dev

deploy-prod: quality
	@$(MAKE) deploy-firebase-prod

deploy-firebase-dev:
	@$(MAKE) deploy-firebase PROJECT=$(DEV_PROJECT)

deploy-firebase-prod:
	@$(MAKE) deploy-firebase PROJECT=$(PROD_PROJECT)

deploy-firebase:
	@test -n "$(PROJECT)" || (echo "PROJECT is required (create .firebaserc from .firebaserc.example)" >&2; exit 1)
	@echo "Deploying firestore, functions, and apphosting to $(PROJECT) in parallel..."
	@set +e; \
	firebase deploy --project $(PROJECT) --only firestore & firestore_pid=$$!; \
	firebase deploy --project $(PROJECT) --only functions & functions_pid=$$!; \
	firebase deploy --project $(PROJECT) --only apphosting:exe-web-app & apphosting_pid=$$!; \
	status=0; \
	wait $$firestore_pid || status=$$?; \
	wait $$functions_pid || status=$$?; \
	wait $$apphosting_pid || status=$$?; \
	exit $$status

# Fast path for web-only deploys. This skips local quality gates, Functions, and Firestore.
# Use deploy-dev/deploy-prod for full release validation.
deploy-web-dev:
	@test -n "$(DEV_PROJECT)" || (echo "Create .firebaserc from .firebaserc.example" >&2; exit 1)
	firebase deploy --project $(DEV_PROJECT) --only apphosting:exe-web-app

deploy-web-prod:
	@test -n "$(PROD_PROJECT)" || (echo "Create .firebaserc from .firebaserc.example" >&2; exit 1)
	firebase deploy --project $(PROD_PROJECT) --only apphosting:exe-web-app
