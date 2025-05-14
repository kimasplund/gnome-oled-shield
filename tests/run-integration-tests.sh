#!/bin/bash

# Integration tests for GNOME OLED Care extension
# This script runs various integration tests in a controlled environment

# Set up error handling
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
ERROR=0

# Create results directory
mkdir -p "$RESULTS_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Helper functions
log() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ERROR=1
}

# Run a GJS script and check its return code
run_gjs_test() {
    local test_script="$1"
    local test_name="$(basename "$test_script" .js)"
    
    log "Running test: $test_name"
    if gjs "$test_script" > "$RESULTS_DIR/${test_name}.log" 2>&1; then
        success "Test $test_name passed"
    else
        error "Test $test_name failed with code $?"
        cat "$RESULTS_DIR/${test_name}.log"
    fi
}

# Verify schema compilation
test_schema_compilation() {
    log "Testing schema compilation"
    if glib-compile-schemas --strict --dry-run "$EXTENSION_DIR/schemas"; then
        success "Schema compilation passed"
    else
        error "Schema compilation failed"
    fi
}

# Run all JS tests in the integration directory and its subdirectories
run_all_integration_tests() {
    log "Finding all integration tests recursively..."
    local test_count=0
    
    # Find all .js files recursively in integration directory
    while IFS= read -r -d '' test_script; do
        if [ -f "$test_script" ]; then
            # Make the script executable if it's not already
            if [ ! -x "$test_script" ]; then
                chmod +x "$test_script"
            fi
            run_gjs_test "$test_script"
            test_count=$((test_count + 1))
        fi
    done < <(find "$SCRIPT_DIR/integration" -name "*.js" -type f -print0)
    
    if [ $test_count -eq 0 ]; then
        log "No integration tests found in $SCRIPT_DIR/integration/"
    else
        log "Ran $test_count integration tests"
    fi
}

# Main test sequence
log "Starting integration tests for OLED Care extension"
log "Extension directory: $EXTENSION_DIR"

# Run all tests
test_schema_compilation
run_all_integration_tests

# Display final results
if [ $ERROR -eq 0 ]; then
    success "All integration tests passed!"
    exit 0
else
    error "Some integration tests failed. See logs for details."
    exit 1
fi
