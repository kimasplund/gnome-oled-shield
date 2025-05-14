# Testing Framework for GNOME OLED Care Extension

This directory contains tests for the GNOME OLED Care extension. The tests are organized into several categories to thoroughly test all aspects of the extension.

## Test Structure

```
tests/
├── unit/                       # Unit tests for individual components
│   ├── **/*spec.js             # Jasmine spec files
│   ├── **/*.test.js            # JS test files
│   └── **/test-*.js            # Test files with test- prefix
├── integration/                # Integration tests
│   └── **/*.js                 # All JS files run as GJS scripts
├── environment/                # Environment-specific tests
│   ├── wayland/                # Tests for Wayland display server
│   │   ├── gnome47/            # GNOME 47-specific tests
│   │   └── gnome48/            # GNOME 48-specific tests
│   ├── x11/                    # Tests for X11 display server
│   │   └── gnome48/            # GNOME 48-specific tests
│   └── testEnvironment.js      # Common environment test utilities
├── test-pixelshift.js          # Special-case test for pixel shift functionality
├── testUtils.js                # Common test utilities
├── run-integration-tests.sh    # Script to run integration tests
├── run-environment-tests.sh    # Script to run environment tests
├── jasmine.json                # Configuration for Jasmine test runner
└── pixelshift-jasmine.json     # Special configuration for pixel shift tests
```

## Test Categories

### Unit Tests

Unit tests focus on testing individual components in isolation. They use the Jasmine testing framework and can be found in the `unit/` directory.

### Integration Tests

Integration tests verify that different components work correctly together. They run with GJS (GNOME JavaScript) and can be found in the `integration/` directory.

### Environment Tests

Environment tests simulate different GNOME environments (Wayland vs X11, GNOME 47 vs 48) to ensure compatibility across platforms. These can be found in the `environment/` directory, organized by display server type and GNOME version.

### Specialized Tests

Some functionality has dedicated test files, such as `test-pixelshift.js`, which tests the pixel shift functionality using a specialized configuration.

## Prerequisites

To run the tests, you need:

1. Jasmine for JavaScript unit tests:
   ```
   npm install -g jasmine
   ```

2. GJS (GNOME JavaScript) for integration tests:
   ```
   sudo apt install gjs
   ```

3. Node.js for ES module tests:
   ```
   sudo apt install nodejs
   ```

## Running Tests

To run all tests:
```
make test
```

To run specific test categories:
```
make test-unit        # Run unit tests only
make test-integration # Run integration tests only
make test-environment # Run environment tests only
make test-pixelshift  # Run pixel shift tests only
```

## Adding New Tests

### Unit Tests

Add test files to `unit/` or any subdirectory following one of these patterns:
- `*.spec.js` - Standard Jasmine spec files
- `*.test.js` - JavaScript test files
- `test-*.js` - Test files with test- prefix

```javascript
describe('Feature name', () => {
  it('should do something specific', () => {
    // Test code
    expect(actual).toBe(expected);
  });
});
```

### Integration Tests

Add JavaScript files to the `integration/` directory or any subdirectory. The test runner will automatically discover and run all `.js` files recursively. Make sure your tests:

1. Are executable (`chmod +x your-test.js`)
2. Have a proper shebang line (`#!/usr/bin/gjs`)
3. Exit with code 0 for success or non-zero for failure

### Environment Tests

Add tests to the appropriate environment directory:
- `environment/wayland/gnome47/` - For Wayland on GNOME 47
- `environment/wayland/gnome48/` - For Wayland on GNOME 48
- `environment/x11/gnome48/` - For X11 on GNOME 48

For ES module tests, use the `.test.js` extension.
For GJS tests, make sure they are executable and have a proper shebang line.

## Test Mocking

Since GNOME Shell extensions rely heavily on the GNOME Shell environment, mocking is used extensively in the tests:

- Simple mocks can be found in individual test files
- Reusable mocks are in `unit/mocks/`
- Environment-specific mocks are in the relevant environment directories

## CI Integration

These tests can be integrated into a CI pipeline to run automatically on code changes. See the project documentation for details on CI integration. 