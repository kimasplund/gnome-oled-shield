UUID = oled-care@asplund.kim
EXTENSIONS_PATH = $(HOME)/.local/share/gnome-shell/extensions
DEV_UUID = $(UUID)-dev
BUILD_DIR = build
DIST_DIR = dist
VERSION := $(shell jq -r '.version' metadata.json)

.PHONY: all clean install uninstall package lint test install-dev uninstall-dev restart-shell watch help dev-setup validate-json build

all: package

$(DIST_DIR):
	mkdir -p $(DIST_DIR)

# Validate JSON files
validate-json:
	@echo "Validating JSON files..."
	@jq '.' metadata.json > /dev/null
	@for schema in schemas/*.xml; do \
		xmllint --noout "$$schema"; \
	done

# Build target that depends on all build steps
build: validate-json
	@echo "Building extension..."
	@mkdir -p $(BUILD_DIR)
	@echo "Compiling schemas..."
	@mkdir -p $(BUILD_DIR)/schemas
	@glib-compile-schemas --strict --targetdir=$(BUILD_DIR)/schemas/ schemas/
	@echo "Copying files..."
	@cp -r \
		extension.js \
		prefs.js \
		metadata.json \
		README.md \
		lib \
		$(BUILD_DIR)/
	@if [ -f LICENSE ]; then \
		cp LICENSE $(BUILD_DIR)/; \
	fi
	@if [ -d icons ]; then \
		cp -r icons $(BUILD_DIR)/; \
	fi
	@cp -r schemas/*.xml $(BUILD_DIR)/schemas/

# Create distributable package
package: build $(DIST_DIR)
	@echo "Creating package..."
	@cd $(BUILD_DIR) && \
	zip -r ../$(DIST_DIR)/$(UUID)-v$(VERSION).zip \
		extension.js \
		prefs.js \
		metadata.json \
		schemas/ \
		lib/ \
		README.md \
		$(if $(wildcard LICENSE),LICENSE,)

# Install the extension locally
install: build
	@echo "Installing extension..."
	@rm -rf $(EXTENSIONS_PATH)/$(UUID)
	@mkdir -p $(EXTENSIONS_PATH)/$(UUID)
	@cp -r $(BUILD_DIR)/* $(EXTENSIONS_PATH)/$(UUID)/
	@echo "Extension installed. Please restart GNOME Shell (Alt+F2, r, Enter on X11 or re-login on Wayland)"

# Install the extension for development
install-dev: build
	@echo "Installing extension for development..."
	@rm -rf $(EXTENSIONS_PATH)/$(DEV_UUID)
	@mkdir -p $(EXTENSIONS_PATH)/$(DEV_UUID)
	@cp -r $(BUILD_DIR)/* $(EXTENSIONS_PATH)/$(DEV_UUID)/
	@sed -i 's/$(UUID)/$(DEV_UUID)/' $(EXTENSIONS_PATH)/$(DEV_UUID)/metadata.json
	@sed -i 's/"development": false/"development": true/' $(EXTENSIONS_PATH)/$(DEV_UUID)/metadata.json
	@mkdir -p $(EXTENSIONS_PATH)/$(DEV_UUID)/schemas
	@cp -f schemas/*.xml $(EXTENSIONS_PATH)/$(DEV_UUID)/schemas/
	@glib-compile-schemas $(EXTENSIONS_PATH)/$(DEV_UUID)/schemas/
	@if [ -d "$(HOME)/.local/share/glib-2.0/schemas" ]; then \
		cp -f schemas/*.xml $(HOME)/.local/share/glib-2.0/schemas/ && \
		glib-compile-schemas $(HOME)/.local/share/glib-2.0/schemas/; \
	fi
	@chmod -R +r $(EXTENSIONS_PATH)/$(DEV_UUID)
	@echo "Development version installed. Please restart GNOME Shell (Alt+F2, r, Enter on X11 or re-login on Wayland)"

# Uninstall the extension
uninstall:
	@echo "Uninstalling extension..."
	@rm -rf $(EXTENSIONS_PATH)/$(UUID)
	@echo "Extension uninstalled"

# Uninstall the development version
uninstall-dev:
	@echo "Uninstalling development version..."
	@rm -rf $(EXTENSIONS_PATH)/$(DEV_UUID)
	@echo "Development version uninstalled"

# Run linting checks
lint:
	@echo "Running ESLint..."
	@if command -v eslint >/dev/null 2>&1; then \
		eslint extension.js prefs.js; \
	else \
		echo "ESLint not found. Please install with: npm install -g eslint"; \
		exit 1; \
	fi

# Run tests (placeholder for future test implementation)
test:
	@echo "Running tests..."
	@echo "No tests implemented yet"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@rm -rf $(DIST_DIR)

# Development setup
dev-setup: dev-setup-deps install-dev
	@echo "Development environment setup complete"

dev-setup-deps:
	@echo "Setting up development dependencies..."
	@if ! command -v eslint >/dev/null 2>&1; then \
		echo "Installing ESLint..."; \
		npm install -g eslint; \
	fi
	@if ! command -v jq >/dev/null 2>&1; then \
		echo "Please install jq: sudo apt install jq"; \
		exit 1; \
	fi
	@if ! command -v xmllint >/dev/null 2>&1; then \
		echo "Please install xmllint: sudo apt install libxml2-utils"; \
		exit 1; \
	fi

# Watch for changes and rebuild
watch:
	@echo "Watching for changes..."
	@while true; do \
		inotifywait -e modify -r extension.js prefs.js schemas/ metadata.json; \
		make install-dev; \
	done

# Restart GNOME Shell (X11 only)
restart-shell:
	@if [ "$$XDG_SESSION_TYPE" = "x11" ]; then \
		echo "Restarting GNOME Shell..."; \
		dbus-send --session --type=method_call --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval string:'global.reexec_self()'; \
	else \
		echo "Please log out and back in to restart GNOME Shell on Wayland"; \
	fi

# Show help
help:
	@echo "Available targets:"
	@echo "  all        - Default target, same as 'package'"
	@echo "  build      - Build the extension"
	@echo "  package    - Create a distributable zip package"
	@echo "  install    - Install the extension locally"
	@echo "  uninstall  - Remove the installed extension"
	@echo "  lint       - Run linting checks"
	@echo "  test       - Run tests (placeholder)"
	@echo "  clean      - Remove build artifacts"
	@echo "  dev-setup  - Set up development environment"
	@echo "  install-dev - Install development version"
	@echo "  uninstall-dev - Remove development version"
	@echo "  restart-shell - Restart GNOME Shell (X11 only)"
	@echo "  watch      - Watch for changes and rebuild"
	@echo "  help       - Show this help message" 