#!/bin/bash

# GNOME OLED Shield Extension Build and Install Script
# This script builds and installs the GNOME OLED Shield extension
# using either Meson or Make build systems.

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Extension details
EXTENSION_UUID="oled-care@asplund.kim"
EXTENSION_NAME="OLED Care"
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"

# Get the absolute path of the workspace
WORKSPACE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# Print header
echo -e "${BOLD}${BLUE}=== GNOME OLED Shield Extension Builder ===${NC}"
echo -e "Project directory: ${WORKSPACE_DIR}"
echo

# Helper functions
function log_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

function log_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

function log_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

function log_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

function check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is required but not found!"
        return 1
    fi
    return 0
}

function clean_build_dirs() {
    log_info "Cleaning build directories..."
    rm -rf "$WORKSPACE_DIR/build" "$WORKSPACE_DIR/builddir" "$WORKSPACE_DIR/_build"
}

function run_tests() {
    log_info "Running extension tests..."
    
    # Check if tests directory exists
    if [ ! -d "$WORKSPACE_DIR/tests" ]; then
        log_warning "Tests directory not found, skipping tests."
        return 0
    fi
    
    # Run the tests
    if [ -f "$WORKSPACE_DIR/tests/run-all-tests.sh" ]; then
        chmod +x "$WORKSPACE_DIR/tests/run-all-tests.sh"
        "$WORKSPACE_DIR/tests/run-all-tests.sh" || {
            log_error "Some tests failed!"
            if [ "$1" = "--ignore-test-failures" ]; then
                log_warning "Continuing despite test failures."
                return 0
            fi
            return 1
        }
    elif [ -f "$WORKSPACE_DIR/run-tests.sh" ]; then
        chmod +x "$WORKSPACE_DIR/run-tests.sh"
        "$WORKSPACE_DIR/run-tests.sh" || {
            log_error "Some tests failed!"
            if [ "$1" = "--ignore-test-failures" ]; then
                log_warning "Continuing despite test failures."
                return 0
            fi
            return 1
        }
    else
        log_warning "No test runner found, skipping tests."
        return 0
    fi
    
    log_success "All tests passed!"
    return 0
}

function verify_installation() {
    log_info "Verifying extension installation..."
    
    if [ -d "$EXTENSIONS_DIR/$EXTENSION_UUID" ]; then
        # Check for critical files
        local missing_files=false
        for file in extension.js prefs.js metadata.json; do
            if [ ! -f "$EXTENSIONS_DIR/$EXTENSION_UUID/$file" ]; then
                log_error "Missing critical file: $file"
                missing_files=true
            fi
        done
        
        # Check for lib directory
        if [ ! -d "$EXTENSIONS_DIR/$EXTENSION_UUID/lib" ]; then
            log_error "Missing lib directory"
            missing_files=true
        else
            # Check library files
            for lib_file in errors.js eventEmitter.js resourceManager.js signalManager.js metrics.js \
                           displayManager.js pixelRefresh.js pixelShift.js dimming.js indicator.js; do
                if [ ! -f "$EXTENSIONS_DIR/$EXTENSION_UUID/lib/$lib_file" ]; then
                    log_error "Missing library file: lib/$lib_file"
                    missing_files=true
                fi
            done
        fi
        
        # Check schema compilation
        if [ ! -f "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas/gschemas.compiled" ]; then
            log_warning "Schema compilation not found. Attempting to compile..."
            glib-compile-schemas "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas/"
        fi
        
        if [ "$missing_files" = false ]; then
            log_success "Extension installed successfully"
            echo
            log_info "To enable the extension, run:"
            echo "  gnome-extensions enable $EXTENSION_UUID"
            return 0
        else
            log_error "Extension installation incomplete"
            return 1
        fi
    else
        log_error "Extension directory not found at $EXTENSIONS_DIR/$EXTENSION_UUID"
        return 1
    fi
}

function build_with_meson() {
    log_info "Building with Meson..."
    
    # Check for meson
    check_command "meson" || return 1
    
    # Create build directory
    if [ ! -d "$WORKSPACE_DIR/builddir" ]; then
        meson setup builddir || {
            log_error "Meson setup failed!"
            return 1
        }
    fi
    
    # Build
    meson compile -C builddir || {
        log_error "Meson compile failed!"
        return 1
    }
    
    # Install
    log_info "Installing extension..."
    # Create extension dir if it doesn't exist
    mkdir -p "$EXTENSIONS_DIR"
    
    # Use more reliable installation method (custom installation)
    ninja -C builddir || {
        log_error "Ninja build failed!"
        return 1
    }
    
    # Copy extension files directly to extensions directory
    rm -rf "$EXTENSIONS_DIR/$EXTENSION_UUID"
    mkdir -p "$EXTENSIONS_DIR/$EXTENSION_UUID/lib" "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas"
    
    # Copy core files
    for file in extension.js prefs.js metadata.json stylesheet.css; do
        if [ -f "$WORKSPACE_DIR/$file" ]; then
            cp "$WORKSPACE_DIR/$file" "$EXTENSIONS_DIR/$EXTENSION_UUID/"
        fi
    done
    
    # Copy lib files
    for file in errors.js eventEmitter.js resourceManager.js signalManager.js metrics.js displayManager.js pixelRefresh.js pixelShift.js dimming.js indicator.js; do
        if [ -f "$WORKSPACE_DIR/lib/$file" ]; then
            cp "$WORKSPACE_DIR/lib/$file" "$EXTENSIONS_DIR/$EXTENSION_UUID/lib/"
        fi
    done
    
    # Copy schema files
    cp "$WORKSPACE_DIR/schemas/"*.xml "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas/"
    
    # Compile schemas
    if [ -d "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas" ]; then
        log_info "Compiling GSettings schemas..."
        glib-compile-schemas "$EXTENSIONS_DIR/$EXTENSION_UUID/schemas/"
    fi
    
    log_success "Build and install with Meson completed!"
    return 0
}

function build_with_make() {
    log_info "Building with Make..."
    
    # Check for make
    check_command "make" || return 1
    
    # Build and install
    make install || {
        log_error "Make install failed!"
        return 1
    }
    
    log_success "Build and install with Make completed!"
    return 0
}

# Main execution
cd "$WORKSPACE_DIR" || {
    log_error "Failed to change to workspace directory!"
    exit 1
}

# Check if the extension.js file exists (basic validation)
if [ ! -f "$WORKSPACE_DIR/extension.js" ]; then
    log_error "This doesn't appear to be a valid GNOME extension. Missing extension.js!"
    exit 1
fi

# Parse arguments
SKIP_TESTS=false
IGNORE_TEST_FAILURES=false
BUILD_SYSTEM=""
CLEAN_BUILD=false

for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN_BUILD=true
            ;;
        --meson)
            BUILD_SYSTEM="meson"
            ;;
        --make)
            BUILD_SYSTEM="make"
            ;;
        --skip-tests)
            SKIP_TESTS=true
            ;;
        --ignore-test-failures)
            IGNORE_TEST_FAILURES=true
            ;;
        --help|-h)
            echo -e "${BOLD}Usage:${NC} $0 [options]"
            echo
            echo -e "${BOLD}Options:${NC}"
            echo "  --clean                Clean build directories before building"
            echo "  --meson                Use Meson build system"
            echo "  --make                 Use Make build system"
            echo "  --skip-tests           Skip running tests"
            echo "  --ignore-test-failures Continue even if tests fail"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
    esac
done

# Clean build directories if requested
if [ "$CLEAN_BUILD" = true ]; then
    clean_build_dirs
fi

# Run tests unless skipped
if [ "$SKIP_TESTS" = false ]; then
    if [ "$IGNORE_TEST_FAILURES" = true ]; then
        run_tests --ignore-test-failures
    else
        run_tests || exit 1
    fi
fi

# Choose build system
if [ "$BUILD_SYSTEM" = "meson" ]; then
    build_with_meson || exit 1
elif [ "$BUILD_SYSTEM" = "make" ]; then
    build_with_make || exit 1
else
    # Auto-detect build system (prefer Meson)
    if [ -f "$WORKSPACE_DIR/meson.build" ]; then
        log_info "Meson build system detected"
        build_with_meson || {
            log_warning "Meson build failed, falling back to Make"
            if [ -f "$WORKSPACE_DIR/Makefile" ]; then
                build_with_make || exit 1
            else
                log_error "No Makefile found for fallback"
                exit 1
            fi
        }
    elif [ -f "$WORKSPACE_DIR/Makefile" ]; then
        log_info "Make build system detected"
        build_with_make || exit 1
    else
        log_error "No supported build system detected (Meson or Make)"
        exit 1
    fi
fi

# Verify the installation
verify_installation

# Provide information on restarting the shell
echo
log_info "To apply changes, restart GNOME Shell:"
echo "  • On X11: Press Alt+F2, type 'r' and press Enter"
echo "  • On Wayland: Log out and log back in"
echo

log_success "GNOME OLED Shield extension installation completed!" 