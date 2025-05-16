#!/bin/bash

# GNOME OLED Shield (OLED Care) Extension
# Build and Installation Script
# Supports both Makefile and Meson build systems

# Exit on error
set -e

# Constants
EXTENSION_UUID="oled-care@kimasplund.online"
EXTENSION_NAME="GNOME OLED Shield"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
GNOME_SHELL_VERSION=$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)
LOCAL_EXTENSION_DIR="${HOME}/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"
SYSTEM_EXTENSION_DIR="/usr/share/gnome-shell/extensions/${EXTENSION_UUID}"
BUILDDIR="builddir"
LOG_FILE="${SCRIPT_DIR}/build-install.log"

# Default options
BUILD_SYSTEM="auto"
INSTALL_TYPE="user"
VERBOSE=false
CLEAN_BUILD=false
TEST_AFTER_BUILD=false
DEBUG_MODE=false
SKIP_DEPENDENCY_CHECK=false

# Text formatting
BOLD="\e[1m"
RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
BLUE="\e[34m"
RESET="\e[0m"

# Banner
show_banner() {
    echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${BLUE}║                GNOME OLED Shield Extension                 ║${RESET}"
    echo -e "${BOLD}${BLUE}║                  Build & Install Script                    ║${RESET}"
    echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
}

# Logging functions
log() {
    local msg="$1"
    local level="${2:-INFO}"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "[${timestamp}] [${level}] ${msg}" | tee -a "${LOG_FILE}"
}

log_error() {
    log "$1" "ERROR" >&2
    echo -e "${RED}ERROR: $1${RESET}" >&2
}

log_warning() {
    log "$1" "WARNING"
    echo -e "${YELLOW}WARNING: $1${RESET}"
}

log_success() {
    log "$1" "SUCCESS"
    echo -e "${GREEN}SUCCESS: $1${RESET}"
}

log_debug() {
    if [ "$DEBUG_MODE" = true ]; then
        log "$1" "DEBUG"
    fi
}

# Print help
show_help() {
    echo -e "${BOLD}Usage:${RESET} $0 [options]"
    echo ""
    echo -e "${BOLD}Options:${RESET}"
    echo "  --make                Use Makefile for building (default: auto-detect)"
    echo "  --meson               Use Meson for building (default: auto-detect)"
    echo "  --system              Install system-wide (default: user-only)"
    echo "  --user                Install for current user only (default)"
    echo "  --clean               Clean before building"
    echo "  --test                Run tests after building"
    echo "  --verbose, -v         Enable verbose output"
    echo "  --debug               Enable debug mode"
    echo "  --skip-deps           Skip dependency checks"
    echo "  --help, -h            Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${RESET}"
    echo "  $0 --meson --clean    Clean and build using Meson"
    echo "  $0 --make --test      Build using Make and run tests"
    echo ""
}

# Check for dependencies
check_dependencies() {
    local missing_deps=()
    
    if [ "$SKIP_DEPENDENCY_CHECK" = true ]; then
        log_debug "Skipping dependency checks"
        return 0
    fi
    
    log "Checking for required dependencies..."
    
    # Common dependencies
    command -v glib-compile-schemas >/dev/null 2>&1 || missing_deps+=("glib-compile-schemas (glib2 package)")
    command -v gnome-shell >/dev/null 2>&1 || missing_deps+=("gnome-shell")
    command -v gjs >/dev/null 2>&1 || missing_deps+=("gjs")
    
    # Check build system specific dependencies
    if [ "$BUILD_SYSTEM" = "auto" ] || [ "$BUILD_SYSTEM" = "make" ]; then
        command -v make >/dev/null 2>&1 || missing_deps+=("make")
    fi
    
    if [ "$BUILD_SYSTEM" = "auto" ] || [ "$BUILD_SYSTEM" = "meson" ]; then
        command -v meson >/dev/null 2>&1 || missing_deps+=("meson")
        command -v ninja >/dev/null 2>&1 || missing_deps+=("ninja")
    fi
    
    # If any dependencies are missing, show error and exit
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        echo -e "${YELLOW}Please install the missing dependencies and try again.${RESET}"
        exit 1
    fi
    
    log "All dependencies are satisfied"
}

# Detect build system
detect_build_system() {
    if [ "$BUILD_SYSTEM" != "auto" ]; then
        log "Using specified build system: $BUILD_SYSTEM"
        return
    fi
    
    if [ -f "${SCRIPT_DIR}/meson.build" ] && command -v meson >/dev/null 2>&1; then
        BUILD_SYSTEM="meson"
        log "Detected Meson build system"
    elif [ -f "${SCRIPT_DIR}/Makefile" ] && command -v make >/dev/null 2>&1; then
        BUILD_SYSTEM="make"
        log "Detected Makefile build system"
    else
        log_error "No supported build system detected (meson or make)"
        exit 1
    fi
}

# Parse command line arguments
parse_arguments() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --make)
                BUILD_SYSTEM="make"
                ;;
            --meson)
                BUILD_SYSTEM="meson"
                ;;
            --system)
                INSTALL_TYPE="system"
                ;;
            --user)
                INSTALL_TYPE="user"
                ;;
            --clean)
                CLEAN_BUILD=true
                ;;
            --test)
                TEST_AFTER_BUILD=true
                ;;
            --verbose|-v)
                VERBOSE=true
                ;;
            --debug)
                DEBUG_MODE=true
                ;;
            --skip-deps)
                SKIP_DEPENDENCY_CHECK=true
                ;;
            --help|-h)
                show_banner
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
        shift
    done
    
    # Check for invalid combinations
    if [ "$INSTALL_TYPE" = "system" ] && [ "$(id -u)" -ne 0 ]; then
        log_error "System-wide installation requires root privileges"
        echo -e "${YELLOW}Try running with sudo or use --user for local installation${RESET}"
        exit 1
    fi
}

# Clean build directories
clean_build_directories() {
    if [ "$CLEAN_BUILD" = true ]; then
        log "Cleaning build directories..."
        
        if [ -d "${SCRIPT_DIR}/${BUILDDIR}" ]; then
            log_debug "Removing ${BUILDDIR}/"
            rm -rf "${SCRIPT_DIR}/${BUILDDIR}"
        fi
        
        if [ -d "${SCRIPT_DIR}/build" ]; then
            log_debug "Removing build/"
            rm -rf "${SCRIPT_DIR}/build"
        fi
        
        # Clean any build artifacts
        if [ "$BUILD_SYSTEM" = "make" ] && [ -f "${SCRIPT_DIR}/Makefile" ]; then
            log_debug "Running make clean"
            make -C "${SCRIPT_DIR}" clean
        fi
        
        log_success "Build directories cleaned"
    fi
}

# Build with Meson
build_meson() {
    log "Building with Meson..."
    
    # Setup builddir if it doesn't exist
    if [ ! -d "${SCRIPT_DIR}/${BUILDDIR}" ]; then
        log_debug "Setting up Meson build directory"
        meson setup "${BUILDDIR}" "${SCRIPT_DIR}" || {
            log_error "Meson setup failed"
            exit 1
        }
    fi
    
    # Compile
    log_debug "Compiling with Meson"
    meson compile -C "${BUILDDIR}" || {
        log_error "Meson compilation failed"
        exit 1
    }
    
    log_success "Meson build completed"
}

# Build with Make
build_make() {
    log "Building with Make..."
    
    # Build using the Makefile
    if [ "$VERBOSE" = true ]; then
        make -C "${SCRIPT_DIR}" || {
            log_error "Make build failed"
            exit 1
        }
    else
        make -C "${SCRIPT_DIR}" >/dev/null || {
            log_error "Make build failed"
            exit 1
        }
    fi
    
    log_success "Make build completed"
}

# Install with Meson
install_meson() {
    log "Installing with Meson..."
    
    # Set installation parameters
    local install_params=()
    
    if [ "$INSTALL_TYPE" = "user" ]; then
        install_params+=("--destdir=")
    fi
    
    # Install
    meson install -C "${BUILDDIR}" "${install_params[@]}" || {
        log_error "Meson installation failed"
        exit 1
    }
    
    log_success "Meson installation completed"
}

# Install with Make
install_make() {
    log "Installing with Make..."
    
    # Set installation parameters
    local install_target="install"
    
    if [ "$INSTALL_TYPE" = "user" ]; then
        install_target="install-user"
    elif [ "$INSTALL_TYPE" = "system" ]; then
        install_target="install-system"
    fi
    
    # Install
    make -C "${SCRIPT_DIR}" "$install_target" || {
        log_error "Make installation failed"
        exit 1
    }
    
    log_success "Make installation completed"
}

# Run tests
run_tests() {
    if [ "$TEST_AFTER_BUILD" = true ]; then
        log "Running tests..."
        
        if [ -f "${SCRIPT_DIR}/run-tests.sh" ]; then
            bash "${SCRIPT_DIR}/run-tests.sh" || {
                log_error "Tests failed"
                exit 1
            }
            log_success "Tests completed successfully"
        else
            log_warning "No test script found (run-tests.sh)"
        fi
    fi
}

# Compile schemas
compile_schemas() {
    log "Compiling GSettings schemas..."
    
    local schema_dir
    
    if [ "$INSTALL_TYPE" = "user" ]; then
        schema_dir="${HOME}/.local/share/glib-2.0/schemas"
    else
        schema_dir="/usr/share/glib-2.0/schemas"
    fi
    
    # Create schema directory if it doesn't exist
    mkdir -p "$schema_dir"
    
    # Compile schemas
    glib-compile-schemas "$schema_dir" || {
        log_warning "Failed to compile schemas"
    }
    
    log_success "Schemas compiled"
}

# Post-installation message
show_post_install_message() {
    echo ""
    echo -e "${BOLD}${GREEN}Installation completed successfully!${RESET}"
    echo ""
    
    if [ "$GNOME_SHELL_VERSION" -lt 45 ]; then
        log_warning "This extension is designed for GNOME Shell 45+. You are running GNOME Shell $GNOME_SHELL_VERSION."
        echo -e "${YELLOW}Some features may not work correctly.${RESET}"
        echo ""
    fi
    
    echo -e "${BOLD}Enabling the extension:${RESET}"
    
    if command -v gnome-extensions >/dev/null 2>&1; then
        echo "  gnome-extensions enable ${EXTENSION_UUID}"
    else
        echo "  You can enable the extension using GNOME Extensions App or Tweaks"
    fi
    
    echo ""
    echo -e "${BOLD}Restarting GNOME Shell:${RESET}"
    echo "  On X11: Press Alt+F2, type 'r' and press Enter"
    echo "  On Wayland: Log out and log back in"
    echo ""
}

# Error handling function
handle_error() {
    log_error "An error occurred during execution"
    echo ""
    echo -e "${YELLOW}Check the log file for details: ${LOG_FILE}${RESET}"
    exit 1
}

# Set up error handling
trap handle_error ERR

# Main function
main() {
    # Initialize log file
    echo "=== Build & Install Log $(date) ===" > "${LOG_FILE}"
    
    # Show banner
    show_banner
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check dependencies
    check_dependencies
    
    # Detect build system if set to auto
    detect_build_system
    
    # Clean build directories if requested
    clean_build_directories
    
    # Build the extension
    if [ "$BUILD_SYSTEM" = "meson" ]; then
        build_meson
        install_meson
    elif [ "$BUILD_SYSTEM" = "make" ]; then
        build_make
        install_make
    else
        log_error "Unknown build system: $BUILD_SYSTEM"
        exit 1
    fi
    
    # Run tests if requested
    run_tests
    
    # Compile schemas
    compile_schemas
    
    # Show post-installation message
    show_post_install_message
    
    log "All done!"
}

# Run main function with all arguments
main "$@" 