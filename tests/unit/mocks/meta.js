'use strict';

import GObject from 'gi://GObject';

/**
 * Mock implementation of the Meta library for testing GNOME Shell extensions
 * This allows testing session-specific behaviors (Wayland vs X11) without requiring
 * actual session changes.
 */

// Session configuration
let _sessionType = 'wayland'; // Default to Wayland
let _inOverview = false;
let _monitorManager = null;

/**
 * Set the mock session type
 * @param {string} sessionType - 'wayland' or 'x11'
 */
export function setSessionType(sessionType) {
    if (sessionType !== 'wayland' && sessionType !== 'x11') {
        throw new Error(`Invalid session type: ${sessionType}. Must be 'wayland' or 'x11'`);
    }
    
    console.log(`[Meta Mock] Setting session type to: ${sessionType}`);
    _sessionType = sessionType;
}

/**
 * Check if the mock is using Wayland compositor
 * @returns {boolean} True if mocking Wayland, false for X11
 */
export function is_wayland_compositor() {
    return _sessionType === 'wayland';
}

/**
 * Set the overview state
 * @param {boolean} active - Whether the overview is active
 */
export function setOverviewActive(active) {
    _inOverview = Boolean(active);
}

/**
 * Check if the overview is active
 * @returns {boolean} True if overview is active
 */
export function is_overview_active() {
    return _inOverview;
}

/**
 * Mock implementation of Meta.Rectangle
 */
class Rectangle extends GObject.Object {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    
    constructor(x = 0, y = 0, width = 0, height = 0) {
        super();
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    
    /**
     * Check if this rectangle contains a point
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if the point is in the rectangle
     */
    contains_point(x, y) {
        return (
            x >= this.x &&
            y >= this.y &&
            x < this.x + this.width &&
            y < this.y + this.height
        );
    }
    
    /**
     * Get a string representation of the rectangle
     * @returns {string} String representation
     */
    toString() {
        return `Meta.Rectangle(${this.x}, ${this.y}, ${this.width}, ${this.height})`;
    }
}

/**
 * Mock implementation of Meta.Monitor
 */
class Monitor extends GObject.Object {
    #index;
    #geometry;
    #name;
    #manufacturer;
    #product;
    #isBuiltIn;
    #isPrimary;
    
    constructor(params = {}) {
        super();
        this.#index = params.index || 0;
        this.#geometry = new Rectangle(
            params.x || 0,
            params.y || 0,
            params.width || 1920,
            params.height || 1080
        );
        this.#name = params.name || `Monitor-${this.#index}`;
        this.#manufacturer = params.manufacturer || 'Mock Manufacturer';
        this.#product = params.product || 'Mock Product';
        this.#isBuiltIn = params.isBuiltIn || false;
        this.#isPrimary = params.isPrimary || (this.#index === 0);
    }
    
    /**
     * Get the monitor's index
     * @returns {number} Monitor index
     */
    get_index() {
        return this.#index;
    }
    
    /**
     * Get the monitor's geometry
     * @returns {Rectangle} Monitor geometry
     */
    get_geometry() {
        return this.#geometry;
    }
    
    /**
     * Get the monitor's display name
     * @returns {string} Display name
     */
    get_display_name() {
        return this.#name;
    }
    
    /**
     * Get the monitor's manufacturer
     * @returns {string} Manufacturer name
     */
    get_manufacturer() {
        return this.#manufacturer;
    }
    
    /**
     * Get the monitor's product code/name
     * @returns {string} Product code/name
     */
    get_product() {
        return this.#product;
    }
    
    /**
     * Check if this is a built-in monitor (like a laptop screen)
     * @returns {boolean} True if built-in
     */
    is_builtin_display() {
        return this.#isBuiltIn;
    }
    
    /**
     * Check if this is the primary monitor
     * @returns {boolean} True if primary
     */
    is_primary() {
        return this.#isPrimary;
    }
    
    /**
     * Get a string representation of the monitor
     * @returns {string} String representation
     */
    toString() {
        return `Meta.Monitor(${this.#index}: ${this.#name})`;
    }
}

/**
 * Mock implementation of Meta.MonitorManager
 */
class MonitorManager extends GObject.Object {
    #monitors = [];
    #primaryIndex = 0;
    
    constructor() {
        super();
        
        // Create a default monitor setup
        this.setMonitors([
            {
                index: 0,
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                name: 'Built-in Display',
                manufacturer: 'Mock Inc.',
                product: 'Laptop Screen',
                isBuiltIn: true,
                isPrimary: true
            }
        ]);
        
        _monitorManager = this;
    }
    
    /**
     * Set up the mock monitors
     * @param {Array} monitorConfigs - Monitor configuration objects
     */
    setMonitors(monitorConfigs) {
        this.#monitors = monitorConfigs.map(config => new Monitor(config));
        
        // Find primary monitor
        for (let i = 0; i < this.#monitors.length; i++) {
            if (this.#monitors[i].is_primary()) {
                this.#primaryIndex = i;
                break;
            }
        }
        
        // Emit change signal
        this.emit('monitors-changed');
    }
    
    /**
     * Get all monitors
     * @returns {Array} List of monitors
     */
    get_monitors() {
        return [...this.#monitors];
    }
    
    /**
     * Get the primary monitor
     * @returns {Monitor} Primary monitor
     */
    get_primary_monitor() {
        return this.#monitors[this.#primaryIndex];
    }
    
    /**
     * Get monitor at index
     * @param {number} index - Monitor index
     * @returns {Monitor} Monitor at the specified index
     */
    get_monitor(index) {
        return this.#monitors[index] || null;
    }
}

// Register the GObject classes
const MetaRectangle = GObject.registerClass({
    GTypeName: 'MockMetaRectangle',
}, Rectangle);

const MetaMonitor = GObject.registerClass({
    GTypeName: 'MockMetaMonitor',
}, Monitor);

const MetaMonitorManager = GObject.registerClass({
    GTypeName: 'MockMetaMonitorManager',
    Signals: {
        'monitors-changed': {},
    }
}, MonitorManager);

// Create and export the monitor manager singleton
export const get_monitor_manager = () => {
    if (!_monitorManager) {
        _monitorManager = new MetaMonitorManager();
    }
    return _monitorManager;
};

// Export session simulation functions
export default {
    setSessionType,
    is_wayland_compositor,
    setOverviewActive,
    is_overview_active,
    Rectangle: MetaRectangle,
    Monitor: MetaMonitor,
    MonitorManager: MetaMonitorManager,
    get_monitor_manager
};

// Export Meta enum constants
export const DisplayDirection = {
    UP: 0,
    DOWN: 1,
    LEFT: 2,
    RIGHT: 3
};

export const MotionDirection = {
    UP: 0,
    DOWN: 1,
    LEFT: 2,
    RIGHT: 3,
    UP_LEFT: 4,
    UP_RIGHT: 5,
    DOWN_LEFT: 6,
    DOWN_RIGHT: 7
};

export const KeyBindingFlags = {
    NONE: 0,
    PER_WINDOW: 1 << 0,
    BUILTIN: 1 << 1,
    IGNORE_AUTOREPEAT: 1 << 2,
    REVERSES: 1 << 3,
    RELEASE: 1 << 4
};

// Mock Meta.WindowActor
export const WindowActor = GObject.registerClass(
    class WindowActor extends GObject.Object {
        constructor() {
            super();
            this._effects = new Map();
        }

        add_effect(effect) {
            this._effects.set(effect.name, effect);
            effect.set_enabled(true);
        }

        remove_effect(name) {
            const effect = this._effects.get(name);
            if (effect) {
                effect.set_enabled(false);
                this._effects.delete(name);
            }
        }

        get_effect(name) {
            const effect = this._effects.get(name);
            return effect && effect.get_enabled() ? effect : null;
        }
    }
);

// Mock Meta.Window
export const Window = GObject.registerClass(
    class Window extends GObject.Object {
        constructor(params = {}) {
            super();
            this._focus = params.focus || false;
        }

        has_focus() {
            return this._focus;
        }

        get_compositor_private() {
            return new WindowActor({ meta_window: this });
        }
    }
);

// Mock Meta.Display
export const Display = GObject.registerClass(
    class Display extends GObject.Object {
        constructor() {
            super();
            this.focus_window = null;
        }

        get_workspace_manager() {
            return {
                get_active_workspace: () => ({
                    list_windows: () => []
                })
            };
        }
    }
);

// Mock Meta.IdleMonitor
export const IdleMonitor = {
    get_core: () => ({
        get_idletime: () => 0
    })
}; 