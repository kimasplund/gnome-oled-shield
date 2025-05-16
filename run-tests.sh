#!/bin/bash

# Exit on error
set -e

# Source directory
SRCDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create temporary runtime directory
RUNTIME_DIR=$(mktemp -d)
trap "rm -rf $RUNTIME_DIR" EXIT

# Set up test environment
export GJS_PATH="$SRCDIR:${GJS_PATH:+:$GJS_PATH}"
export GI_TYPELIB_PATH="$SRCDIR:${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
export G_TEST_SRCDIR="$SRCDIR"
export G_TEST_BUILDDIR="$RUNTIME_DIR"
export G_DEBUG="fatal-warnings"
export GSETTINGS_SCHEMA_DIR="$SRCDIR/schemas"
export GSETTINGS_BACKEND="memory"

# Compile schemas for tests
if [ -d "$SRCDIR/schemas" ]; then
    glib-compile-schemas "$SRCDIR/schemas"
fi

# Create test results directory
RESULTS_DIR="$RUNTIME_DIR/test-results"
mkdir -p "$RESULTS_DIR"

# Run tests with coverage
COVERAGE_DIR="$RUNTIME_DIR/coverage"
mkdir -p "$COVERAGE_DIR"

echo "Running tests..."

# Run root level tests
for test_file in "$SRCDIR"/tests/test-*.js; do
    if [ -f "$test_file" ]; then
        test_name=$(basename "$test_file" .js)
        echo "Running $test_name..."
        
        # Run test with coverage
        gjs --coverage-prefix="$SRCDIR" \
            --coverage-output="$COVERAGE_DIR/${test_name}.lcov" \
            -m "$test_file" \
            > "$RESULTS_DIR/${test_name}.log" 2>&1 || {
            echo "Test $test_name failed!"
            cat "$RESULTS_DIR/${test_name}.log"
            exit 1
        }
    fi
done

# Run unit tests
for test_file in "$SRCDIR"/tests/unit/test-*.js; do
    if [ -f "$test_file" ]; then
        test_name=$(basename "$test_file" .js)
        echo "Running unit test: $test_name..."
        
        # Special handling for session-specific tests
        if [[ "$test_name" == *"-sessions"* ]]; then
            echo "Running session-specific test: $test_name..."
            
            # For session-specific tests, set environment variables
            # to simulate different session types
            export GNOME_SESSION_TYPE="wayland"
            gjs --coverage-prefix="$SRCDIR" \
                --coverage-output="$COVERAGE_DIR/unit-${test_name}-wayland.lcov" \
                -m "$test_file" \
                > "$RESULTS_DIR/unit-${test_name}-wayland.log" 2>&1 || {
                echo "Unit test $test_name (wayland) failed!"
                cat "$RESULTS_DIR/unit-${test_name}-wayland.log"
                exit 1
            }
            
            # Run with X11 environment
            export GNOME_SESSION_TYPE="x11"
            gjs --coverage-prefix="$SRCDIR" \
                --coverage-output="$COVERAGE_DIR/unit-${test_name}-x11.lcov" \
                -m "$test_file" \
                > "$RESULTS_DIR/unit-${test_name}-x11.log" 2>&1 || {
                echo "Unit test $test_name (x11) failed!"
                cat "$RESULTS_DIR/unit-${test_name}-x11.log"
                exit 1
            }
            
            # Reset environment variable
            unset GNOME_SESSION_TYPE
        else
            # Regular test
            gjs --coverage-prefix="$SRCDIR" \
                --coverage-output="$COVERAGE_DIR/unit-${test_name}.lcov" \
                -m "$test_file" \
                > "$RESULTS_DIR/unit-${test_name}.log" 2>&1 || {
                echo "Unit test $test_name failed!"
                cat "$RESULTS_DIR/unit-${test_name}.log"
                exit 1
            }
        fi
    fi
done

echo "All tests passed!"

# Generate coverage report if lcov is available
if command -v lcov >/dev/null 2>&1; then
    echo "Generating coverage report..."
    lcov --capture --directory "$COVERAGE_DIR" --output-file "$COVERAGE_DIR/coverage.info"
    genhtml "$COVERAGE_DIR/coverage.info" --output-directory "$COVERAGE_DIR/html"
    echo "Coverage report generated in $COVERAGE_DIR/html"
fi 