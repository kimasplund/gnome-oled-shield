#!/bin/bash

# Run Node.js compatible tests for GNOME OLED Shield extension

# Ensure we're in the project root directory
cd "$(dirname "$0")/.." || exit 1

# Directories
TEST_DIR="tests"
RESULTS_DIR="test-results"

# Create results directory if it doesn't exist
mkdir -p "$RESULTS_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Running Node.js compatible tests for GNOME OLED Shield extension${NC}"
echo "========================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js to run these tests."
    exit 1
fi

# Check if necessary npm packages are installed
if [ ! -d "node_modules/jasmine" ]; then
    echo -e "${YELLOW}Installing test dependencies...${NC}"
    npm install
fi

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
JASMINE_CONFIG_PATH=tests/node-jasmine.json npx --node-arg=--experimental-vm-modules jasmine

# Check result
if [ $? -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Tests failed!${NC}"
    exit 1
fi