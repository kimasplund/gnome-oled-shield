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

# Create directories for test results
RESULTS_DIR="$SRCDIR/test-results"
mkdir -p "$RESULTS_DIR"

echo -e "${YELLOW}Running Node.js compatible tests...${NC}"

# Add the project directory to NODE_PATH
export NODE_PATH="$SRCDIR:$NODE_PATH"

# Run the Node.js test runner
node "$SRCDIR/tests/run-node-tests.js"

# Check the exit code
if [ $? -eq 0 ]; then
    echo -e "${GREEN}All Node.js tests passed!${NC}"
else
    echo -e "${RED}Some Node.js tests failed!${NC}"
    exit 1
fi