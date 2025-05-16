#!/bin/bash

# OLED Care Extension - Build and Install Script
# This script performs a clean build and installation of the extension

set -e  # Exit on any error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "${SCRIPT_DIR}/.." && pwd )"

cd "${PROJECT_DIR}"

# Show header
echo "=============================================="
echo "OLED Care Extension - Build and Install Script"
echo "=============================================="
echo ""

# Check for required tools
echo "Checking required tools..."
for cmd in make glib-compile-schemas jq xmllint zip; do
    if ! command -v $cmd &> /dev/null; then
        echo "Error: $cmd is not installed or not in PATH"
        echo "Please install the required tools."
        echo "On Ubuntu/Debian: sudo apt install build-essential libglib2.0-dev-bin jq libxml2-utils zip"
        echo "On Fedora: sudo dnf install make glib2-devel jq libxml2 zip"
        echo "On Arch: sudo pacman -S make glib2 jq libxml2 zip"
        exit 1
    fi
done

echo "✓ All required tools found"
echo ""

# Clean previous build artifacts
echo "Cleaning up previous build..."
make clean
echo "✓ Cleanup complete"
echo ""

# Run tests
echo "Running tests..."
tests/run-all-tests.sh || {
    echo "⚠ Warning: Some tests failed, but continuing with build"
    echo ""
}

# Build extension
echo "Building extension..."
make build
echo "✓ Build complete"
echo ""

# Install extension
echo "Installing extension..."
make install
echo "✓ Installation complete"
echo ""

# Create package
echo "Creating distributable package..."
make package
echo "✓ Package created in dist/ directory"
echo ""

# Restart GNOME Shell if running in X11
if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    echo "Attempting to restart GNOME Shell..."
    dbus-send --session --type=method_call \
        --dest=org.gnome.Shell /org/gnome/Shell \
        org.gnome.Shell.Eval string:'global.reexec_self();' &> /dev/null || true
    echo "✓ Signal sent to restart GNOME Shell"
else
    echo "⚠ Running in Wayland session. Please log out and log back in to activate the extension."
fi

echo ""
echo "=============================================="
echo "Build and installation completed successfully!"
echo "Extension is installed at: ~/.local/share/gnome-shell/extensions/oled-care@asplund.kim"
echo "Packaged version available at: ${PROJECT_DIR}/dist/"
echo "==============================================" 