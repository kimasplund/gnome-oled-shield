# GNOME OLED Shield Architecture

This document provides a detailed overview of the architecture and design patterns used in the GNOME OLED Shield extension.

## Modern JavaScript Features

The codebase leverages the latest ES2021+ features to enhance performance, reliability, and maintainability:

### Private Fields (`#` prefix)

Private fields ensure proper encapsulation by making certain properties inaccessible from outside their containing class:

```javascript
class DisplayManager extends EventEmitter {
    // Private fields
    #settings;
    #monitors = [];
    #displayTypes = new Map();
    
    // Public method that accesses private field
    getDisplays() {
        return [...this.#monitors];
    }
}
```

### Static Initialization Blocks

Static initialization blocks provide a clean way to initialize complex static class properties:

```javascript
static {
    this.ERROR_LEVELS = Object.freeze({
        CRITICAL: 'critical',
        ERROR: 'error',
        WARNING: 'warning',
        INFO: 'info'
    });
    
    this.STATUS = Object.freeze({
        IDLE: 'idle',
        RUNNING: 'running',
        ERROR: 'error',
        DISABLED: 'disabled'
    });
}
```

### Nullish Coalescing and Optional Chaining

These operators provide safer and more concise ways to work with potentially undefined or null values:

```javascript
// Optional chaining
const displayName = monitor?.get_display_name?.() || 'Unknown';

// Nullish coalescing
const debugMode = this.#settings?.get_boolean(CONSTANTS.SETTINGS.DEBUG_MODE) ?? false;
```

## Core Architectural Components

### EventEmitter System

The EventEmitter class forms the foundation of our event-based communication system:

```javascript
// Emitting events
this.emit('refresh-progress', progress);

// Listening for events
pixelRefresh.on('refresh-completed', () => {
    indicator.updateStatus('idle');
});
```

Key features:
- Support for one-time listeners (`once`)
- Integration with AbortSignal for cancellable listeners
- Promise-based event waiting (`waitForEvent`)
- Event listener limits to prevent memory leaks

### Resource Management

The ResourceManager handles tracking and automatic cleanup of resources:

```javascript
// Creating a bundle for related resources
this.#resourceBundle = this.#resourceManager.createBundle('displayManager');

// Tracking a resource with an automatic cleanup function
this.#resourceBundle.track(
    { id: timeoutId },
    () => GLib.source_remove(timeoutId),
    ResourceManager.RESOURCE_TYPES.TIMEOUT,
    { name: 'refresh-timeout' }
);
```

Key features:
- WeakRef-based tracking to avoid memory leaks
- FinalizationRegistry for automatic cleanup of garbage-collected objects
- Resource bundles for grouped cleanup
- Resource categorization and tagging

### Signal Management

The SignalManager provides robust management of GObject signals:

```javascript
// Connect to a signal
const signalId = this.#signalManager.connect(
    this.#settings,
    `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED}`,
    this.#onEnabledChanged.bind(this),
    'refresh-enabled-changed'
);

// Disconnect by ID, object, or group
await this.#signalManager.disconnect(signalId);
await this.#signalManager.disconnectByObject(this.#settings);
```

Key features:
- Automatic tracking of signal connections
- Connection grouping for bulk operations
- Integration with ResourceManager for cleanup
- Signal pattern recognition and optimization

### Error Handling

A comprehensive error system based on custom error classes:

```javascript
// Custom error class
class PixelRefreshError extends ExtensionError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            context: options.context || 'pixelrefresh'
        });
        this.name = 'PixelRefreshError';
    }
    
    static operationFailed(operation, cause) {
        return new PixelRefreshError(`Failed to perform pixel refresh operation: ${operation}`, {
            cause,
            context: 'operation',
            metadata: { operation }
        });
    }
}

// Using the error registry
errorRegistry.registerError(error, 'component_initialization');
```

Key features:
- Error chaining with `cause` property
- Rich error context and metadata
- Error levels (critical, error, warning, info)
- Centralized error registry for monitoring and analysis

### Metrics Collection

Performance monitoring and metrics gathering:

```javascript
// Start a timer for an operation
const timer = metrics.startTimer('display_refresh');

// Track the result
try {
    // Operation code...
    timer.stop();
} catch (error) {
    timer.addLabels({ error: true });
    timer.stop();
}

// Increment a counter
metrics.incrementCounter('debug_messages', 1, { component: 'DisplayManager' });
```

Key features:
- Operation timing with detailed categorization
- Counter metrics with labels
- Gauge and histogram metrics
- Frame rate monitoring

## Module Structure

The extension is organized into several key modules:

### Core Utilities

- `eventEmitter.js`: Event system for asynchronous communication
- `resourceManager.js`: Resource tracking and lifecycle management
- `signalManager.js`: GObject signal connection management
- `errors.js`: Error classes and registry
- `metrics.js`: Performance monitoring

### Feature Modules

- `displayManager.js`: Monitor detection and management
- `pixelShift.js`: Screen content shifting implementation
- `pixelRefresh.js`: Full-screen refresh operations
- `dimming.js`: Screen and UI element dimming
- `indicator.js`: Status panel indicator and menu

### Extension Entry Point

- `extension.js`: Main entry point implementing Extension class
- `prefs.js`: Preferences system implementing ExtensionPreferences

## Initialization Flow

1. Extension is loaded and constructed
2. ResourceManager and SignalManager are initialized
3. Each component is initialized with dependencies injected
4. Settings are loaded and applied
5. Status indicator is created
6. Components are enabled or disabled based on settings

## Asynchronous Operation

Many operations in the extension are asynchronous and use modern Promise-based patterns:

```javascript
async #initializeComponentsAsync() {
    // Create initialization promises for each component
    const initPromises = componentsInOrder.map(compKey => {
        const component = OledCareExtension.COMPONENTS[compKey];
        return this.#initComponent(component).then(instance => {
            this.#components.set(compKey, instance);
            this[component.field] = instance;
            return instance;
        });
    });
    
    // Create a timeout promise
    const timeoutController = new AbortController();
    const timeoutPromise = new Promise((_, reject) => {
        // Set up timeout with abort capability
    });
    
    // Race the component initialization against timeout
    try {
        await Promise.race([
            Promise.allSettled(initPromises),
            timeoutPromise
        ]);
        
        // If successful, cancel the timeout
        timeoutController.abort();
        
        // Check for any failed components
        // ...
    } catch (error) {
        // Handle initialization failures
    }
}
```

Key asynchronous patterns:
- Promise.race for timeouts
- Promise.allSettled for handling partial failures
- AbortController for cancellation
- Async resource cleanup

## Memory Management

The extension implements advanced memory management techniques:

### WeakRef and FinalizationRegistry

```javascript
constructor() {
    // Create finalization registry for automatic cleanup
    this.#registry = new FinalizationRegistry(this.#finalizeResource.bind(this));
}

track(resource, cleanupFn, resourceType, metadata = {}) {
    // Create a weak reference to the resource
    const weakRef = new WeakRef(resource);
    
    // Register for finalization when garbage collected
    this.#registry.register(resource, {
        weakRef,
        cleanupFn,
        resourceType,
        metadata
    });
    
    // Store in our tracking map while the resource exists
    this.#resources.set(this.#getResourceId(resource), {
        weakRef,
        cleanupFn,
        resourceType,
        metadata
    });
}
```

### Resource Bundling

```javascript
createBundle(name = '') {
    return new ResourceBundle(this, name);
}

class ResourceBundle {
    #resources = new Set();
    #parent;
    #name;
    
    constructor(parent, name) {
        this.#parent = parent;
        this.#name = name;
    }
    
    track(resource, cleanupFn, resourceType, metadata = {}) {
        const id = this.#parent.track(resource, cleanupFn, resourceType, {
            ...metadata,
            bundle: this.#name
        });
        
        this.#resources.add(id);
        return id;
    }
    
    async destroy() {
        // Clean up all resources in the bundle
        const promises = [...this.#resources].map(id => this.#parent.cleanup(id));
        await Promise.allSettled(promises);
        this.#resources.clear();
    }
}
```

## Testing Strategy

The extension includes a comprehensive test suite to verify the modernization features:

- Unit tests for each core utility
- Integration tests for feature modules
- End-to-end tests for full extension

Key testing patterns:
- Asynchronous test support
- Test timeouts using Promise.race
- Structured test results and reporting
- Memory leak detection

## Compatibility

The extension is designed to work seamlessly across GNOME Shell versions:

- Strict use of ES modules
- Resource URI format for imports
- Proper resource cleanup
- Feature detection for version-specific capabilities

## Conclusion

The GNOME OLED Shield extension demonstrates how modern JavaScript features can be effectively used to build a robust, maintainable GNOME Shell extension. By leveraging these advanced techniques, the extension achieves:

- Better code organization and maintainability
- Reduced memory leaks and resource consumption
- More robust error handling and recovery
- Performance monitoring and optimization
- Cleaner asynchronous operation

This architecture sets a standard for modern GNOME extension development using the full power of contemporary JavaScript. 