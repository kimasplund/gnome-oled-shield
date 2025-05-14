#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Exit on error
set -e

# Set source directory
SRCDIR="$(pwd)"

# Set environment variables
export GJS_PATH="$SRCDIR:$SRCDIR/tests"
export GI_TYPELIB_PATH="/usr/lib/x86_64-linux-gnu/girepository-1.0"
export G_TEST_SRCDIR="$SRCDIR"
export G_TEST_BUILDDIR="$SRCDIR"
export G_DEBUG="fatal-warnings"
export GSETTINGS_SCHEMA_DIR="$SRCDIR/schemas"
export GSETTINGS_BACKEND="memory"

# Create directories for test results
RESULTS_DIR="$SRCDIR/test-results"
mkdir -p "$RESULTS_DIR"

# Function to run tests in a directory
run_tests_in_dir() {
    local test_dir=$1
    local test_type=$2
    
    echo "Running ${test_type} tests for ${test_dir}..."
    
    # Check if directory exists and contains test files
    if [ -d "tests/${test_type}/${test_dir}" ]; then
        for test in tests/${test_type}/${test_dir}/test-*.js; do
            if [ -f "$test" ]; then
                echo "Running test: $test"
                G_TEST_SRCDIR=1 gjs -m "$test"
                if [ $? -ne 0 ]; then
                    exit 1
                fi
            fi
        done
    fi
}

# Run unit tests
echo "Running unit tests..."
for dir in lib extension prefs; do
    run_tests_in_dir $dir "unit"
done

# For now, skip integration tests as they need more setup
# echo "Running integration tests..."
# for dir in lib extension prefs; do
#     run_tests_in_dir $dir "integration"
# done 