# Contributing to GNOME OLED Shield

Thank you for your interest in contributing to the GNOME OLED Shield extension! This document provides guidelines and information for contributors.

## Code of Conduct

Please be respectful and considerate of others when participating in this project. We follow the [GNOME Code of Conduct](https://wiki.gnome.org/Foundation/CodeOfConduct).

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see [README.md](README.md))
4. Create a new branch for your changes
5. Make your changes following our coding standards
6. Run tests to ensure your changes work correctly
7. Submit a pull request

## Development Environment

Ensure you have the following installed:
- GNOME Shell 45+
- GJS 1.74+
- Git
- A code editor with JavaScript support

## Code Style and Conventions

We use modern JavaScript (ES2021+) features and follow these conventions:

### Naming Conventions

- **Classes**: PascalCase (`PixelRefresh`, `DisplayManager`)
- **Methods & Properties**: camelCase (`getDisplays()`, `refreshNow()`)
- **Private Fields**: Use `#` prefix (`#settings`, `#monitors`)
- **Constants**: UPPER_SNAKE_CASE (`REFRESH_INTERVAL`, `ERROR_LEVELS`)
- **File Names**: camelCase.js (`pixelRefresh.js`, `eventEmitter.js`)

### Coding Principles

1. **Encapsulation**: Use private fields for internal state
2. **Immutability**: Use `Object.freeze()` for constants
3. **Error Handling**: Use the error hierarchy system
4. **Resource Management**: Always clean up resources
5. **Type Documentation**: Use JSDoc comments for type information

### Code Style Example

```javascript
/**
 * Manages display settings for OLED monitors
 * @typedef {Object} DisplayOptions
 * @property {boolean} detectOled - Whether to auto-detect OLED displays
 * @property {number} refreshInterval - Refresh interval in minutes
 */
class DisplayManager extends EventEmitter {
    // Private fields with meaningful names
    #settings;
    #monitors = [];
    #isActive = false;
    
    // Static initialization block for constants
    static {
        this.DISPLAY_TYPES = Object.freeze({
            OLED: 'oled',
            LCD: 'lcd',
            UNKNOWN: 'unknown'
        });
    }
    
    /**
     * Create a new DisplayManager
     * @param {Gio.Settings} settings - GSettings object
     * @param {DisplayOptions} options - Display options
     */
    constructor(settings, options = {}) {
        super();
        this.#settings = settings;
        // Implementation...
    }
    
    /**
     * Get all available displays
     * @returns {Array<object>} Array of monitor objects
     */
    getDisplays() {
        return [...this.#monitors];
    }
}
```

### Design Principles

1. **Modularity**: Each file should have a single responsibility
2. **Maintainability**: Code should be clear and well-documented
3. **Resource Efficiency**: Minimize memory usage and clean up resources
4. **Error Recovery**: Systems should gracefully handle errors
5. **Testability**: Code should be easy to test

## Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update the README.md if needed
5. Submit a pull request with a clear description of changes

### PR Description Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Documentation update
- [ ] Other (please describe)

## How to Test
1. Steps to test the changes
2. Expected result

## Related Issues
Closes #issue_number
```

## Testing

We have several types of tests:

1. **Unit Tests**: For testing individual components
2. **Integration Tests**: For testing component interactions
3. **System Tests**: For testing the full extension

Run tests with:

```bash
# Run all tests
make test

# Run specific test
gjs -m tests/test-file.js
```

## Documentation

Please document your code using JSDoc comments and ensure:

1. All public methods and properties are documented
2. Complex algorithms have explanatory comments
3. New features are added to README.md and ARCHITECTURE.md

## License

By contributing to this project, you agree that your contributions will be licensed under the project's GPL-3.0 License.

## Questions?

Feel free to reach out to the maintainers if you have any questions about contributing.

Thank you for helping improve GNOME OLED Shield! 