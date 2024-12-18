UUID = oled-care@asplund.kim
EXTENSIONS_PATH = $(HOME)/.local/share/gnome-shell/extensions
BUILD_DIR = build
DIST_DIR = dist
VERSION := $(shell jq -r '.version' metadata.json)

.PHONY: all clean install uninstall package lint test

all: package

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(DIST_DIR):
	mkdir -p $(DIST_DIR)

# Validate JSON files
validate-json: metadata.json
	@echo "Validating JSON files..."
	@jq '.' metadata.json > /dev/null
	@for schema in schemas/*.xml; do \
		xmllint --noout "$$schema"; \
	done

# Compile schemas
compile-schemas: validate-json
	@echo "Compiling schemas..."
	@mkdir -p $(BUILD_DIR)/schemas
	@glib-compile-schemas --strict --targetdir=$(BUILD_DIR)/schemas/ schemas/

# Copy files to build directory
build: $(BUILD_DIR) compile-schemas
	@echo "Building extension..."
	@cp -r \
		extension.js \
		prefs.js \
		metadata.json \
		README.md \
		LICENSE \
		$(BUILD_DIR)/
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
		README.md \
		LICENSE

# Install the extension locally
install: build
	@echo "Installing extension..."
	@rm -rf $(EXTENSIONS_PATH)/$(UUID)
	@mkdir -p $(EXTENSIONS_PATH)/$(UUID)
	@cp -r $(BUILD_DIR)/* $(EXTENSIONS_PATH)/$(UUID)/
	@echo "Extension installed. Please restart GNOME Shell (Alt+F2, r, Enter on X11 or re-login on Wayland)"

# Uninstall the extension
uninstall:
	@echo "Uninstalling extension..."
	@rm -rf $(EXTENSIONS_PATH)/$(UUID)
	@echo "Extension uninstalled"

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
dev-setup:
	@echo "Setting up development environment..."
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

# Watch for changes and rebuild (requires inotifywait)
watch:
	@echo "Watching for changes..."
	@while true; do \
		inotifywait -e modify -r extension.js prefs.js schemas/ metadata.json; \
		make install; \
	done

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
	@echo "  watch      - Watch for changes and rebuild"
	@echo "  help       - Show this help message" 