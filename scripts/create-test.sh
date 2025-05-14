#!/bin/bash

# Script to create new test files of the appropriate type

set -e

# Default values
TEST_TYPE="unit"
TEST_NAME=""
COMPONENT_NAME=""
SHOW_HELP=false

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -n|--name)
            TEST_NAME="$2"
            shift 2
            ;;
        -c|--component)
            COMPONENT_NAME="$2"
            shift 2
            ;;
        -h|--help)
            SHOW_HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            SHOW_HELP=true
            shift
            ;;
    esac
done

# Show help if requested or if required arguments are missing
if [[ "$SHOW_HELP" = true || -z "$TEST_NAME" ]]; then
    echo -e "${BLUE}Create Test Script${NC}"
    echo "This script creates new test files of the appropriate type."
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE        Test type (unit, integration, environment) [default: unit]"
    echo "  -n, --name NAME        Test name (required)"
    echo "  -c, --component NAME   Component name (optional)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -t unit -n dimming -c display          # Creates unit/display/dimming.spec.js"
    echo "  $0 -t integration -n panel -c components  # Creates integration/components/test-panel.js"
    echo "  $0 -t environment -n dimming -c wayland   # Creates environment/wayland/gnome48/dimming.test.js"
    exit 0
fi

# Get the repository root directory
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS_DIR="$REPO_DIR/tests"

# Ensure the tests directory exists
mkdir -p "$TESTS_DIR"

# Function to create a unit test
create_unit_test() {
    local name="$1"
    local component="${2:-}"
    local test_dir="$TESTS_DIR/unit"
    
    if [[ -n "$component" ]]; then
        test_dir="$test_dir/$component"
    fi
    
    mkdir -p "$test_dir"
    local file_path="$test_dir/${name}.spec.js"
    
    if [[ -f "$file_path" ]]; then
        echo -e "${YELLOW}Warning:${NC} File $file_path already exists. Skipping."
        return
    fi
    
    echo -e "${GREEN}Creating unit test:${NC} $file_path"
    
    cat > "$file_path" << EOL
// Unit test for $name ${component:+"in $component"}

describe('${component:+$component/}$name', () => {
    beforeEach(() => {
        // Setup for each test
    });
    
    afterEach(() => {
        // Cleanup after each test
    });
    
    it('should initialize correctly', () => {
        // Test initialization
        expect(true).toBe(true);
    });
    
    it('should handle basic functionality', () => {
        // Test basic functionality
        expect(true).toBe(true);
    });
    
    // Add more test cases as needed
});
EOL
    
    echo -e "${GREEN}Successfully created unit test:${NC} $file_path"
}

# Function to create an integration test
create_integration_test() {
    local name="$1"
    local component="${2:-}"
    local test_dir="$TESTS_DIR/integration"
    
    if [[ -n "$component" ]]; then
        test_dir="$test_dir/$component"
    fi
    
    mkdir -p "$test_dir"
    local file_path="$test_dir/test-${name}.js"
    
    if [[ -f "$file_path" ]]; then
        echo -e "${YELLOW}Warning:${NC} File $file_path already exists. Skipping."
        return
    fi
    
    echo -e "${GREEN}Creating integration test:${NC} $file_path"
    
    cat > "$file_path" << EOL
#!/usr/bin/gjs

// Integration test for $name ${component:+"in $component"}

const { GLib, Gio } = imports.gi;

imports.searchPath.unshift('.');

// Log testing framework
const log = (message) => {
    print(\`[TEST] \${message}\`);
};

log('Starting $name test');

try {
    // Test implementation
    log('Testing $name functionality...');
    
    // TODO: Add test implementation here
    
    // Simulate async operation
    const loop = GLib.MainLoop.new(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        log('$name test completed successfully');
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    
    loop.run();
    
} catch (e) {
    log(\`ERROR: \${e.message}\`);
    log(e.stack);
    imports.system.exit(1);
}

imports.system.exit(0);
EOL
    
    # Make the file executable
    chmod +x "$file_path"
    
    echo -e "${GREEN}Successfully created integration test:${NC} $file_path"
}

# Function to create an environment test
create_environment_test() {
    local name="$1"
    local component="${2:-wayland}"
    local version="${3:-48}"
    
    # Default to wayland/gnome48 if not specified
    if [[ "$component" != "wayland" && "$component" != "x11" ]]; then
        local test_dir="$TESTS_DIR/environment/$component"
        mkdir -p "$test_dir"
    else
        local test_dir="$TESTS_DIR/environment/$component/gnome$version"
        mkdir -p "$test_dir"
    fi
    
    local file_path="$test_dir/${name}.test.js"
    
    if [[ -f "$file_path" ]]; then
        echo -e "${YELLOW}Warning:${NC} File $file_path already exists. Skipping."
        return
    fi
    
    echo -e "${GREEN}Creating environment test:${NC} $file_path"
    
    cat > "$file_path" << EOL
// Environment test for $name on ${component}${version:+/GNOME $version}

import * as TestUtils from '../../../testUtils.js';

// Mock objects for environment
const mockEnvironment = {
    display: {
        get_n_monitors: () => 2,
        get_monitor: (i) => ({ model: i === 0 ? 'Test OLED Display' : 'Test LCD Display' })
    },
    monitors: [],
    MonitorManager: {
        get_display: () => mockEnvironment.display
    },
    IdleMonitor: {
        watch_idle: () => 1,
        remove_watch: () => {}
    }
};

describe('$name Tests (GNOME ${version:-48}, ${component})', () => {
    let mockMonitors;
    
    // Utility function to create mock monitors
    function createMockMonitors(count = 2) {
        const monitors = [];
        for (let i = 0; i < count; i++) {
            monitors.push({
                index: i,
                model: i === 0 ? 'Test OLED Display' : 'Test LCD Display',
                is_primary: i === 0,
                geometry: { x: 0, y: 0, width: 1920, height: 1080 },
                supported: true
            });
        }
        return monitors;
    }
    
    beforeEach(() => {
        mockMonitors = createMockMonitors();
        mockEnvironment.monitors = mockMonitors;
    });
    
    it('should initialize correctly', () => {
        // Test initialization
        expect(mockEnvironment.monitors.length).toBe(2);
        expect(mockEnvironment.monitors[0].model).toContain('OLED');
    });
    
    it('should handle basic functionality', () => {
        // Test basic functionality
        expect(mockEnvironment.display.get_n_monitors()).toBe(2);
    });
    
    // Add more test cases as needed
});
EOL
    
    echo -e "${GREEN}Successfully created environment test:${NC} $file_path"
}

# Create the appropriate test type
case "$TEST_TYPE" in
    unit)
        create_unit_test "$TEST_NAME" "$COMPONENT_NAME"
        ;;
    integration)
        create_integration_test "$TEST_NAME" "$COMPONENT_NAME"
        ;;
    environment)
        create_environment_test "$TEST_NAME" "$COMPONENT_NAME"
        ;;
    *)
        echo -e "${YELLOW}Unknown test type:${NC} $TEST_TYPE"
        echo "Valid types are: unit, integration, environment"
        exit 1
        ;;
esac

echo -e "${BLUE}Done!${NC} Use 'make test' to run all tests, or 'make test-$TEST_TYPE' to run just this type." 