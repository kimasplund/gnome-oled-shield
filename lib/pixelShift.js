'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Import error handling and utilities
import { ExtensionError } from './errors.js';
import { metrics } from './metrics.js';

// Defined as a frozen object for immutability
const CONSTANTS = Object.freeze({
    PIXEL_SHIFT_AMOUNT: 1, // pixels to shift
    SETTINGS: {
        DEBUG_MODE: 'debug-mode',
        PIXEL_SHIFT_ENABLED: 'pixel-shift-enabled',
        PIXEL_SHIFT_INTERVAL: 'pixel-shift-interval'
    },
    PERFORMANCE_BUDGET: {
        SHIFT_OPERATION: 5 // milliseconds
    }
});

/**
 * Custom error class for pixel shift operations
 */
class PixelShiftError extends ExtensionError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            context: options.context || 'pixelshift'
        });
        this.name = 'PixelShiftError';
    }

    static operationFailed(operation, cause) {
        return new PixelShiftError(`Failed to perform pixel shift operation: ${operation}`, {
            cause,
            context: 'operation',
            metadata: { operation }
        });
    }
}

/**
 * Manages pixel shifting to prevent OLED burn-in
 */
@GObject.registerClass({
    GTypeName: 'OledCarePixelShift'
})
export default class PixelShift extends GObject.Object {
    // Static initialization block for constants
    static {
        this.REQUIRED_SETTINGS = Object.values(CONSTANTS.SETTINGS);
    }

    // Private fields using true private syntax
    #settings;
    #currentShift = { x: 0, y: 0 };
    #pixelShiftTimeout = null;
    #usePortalAPI = false;
    #debug;
    #resourceManager = null;
    #signalManager = null;
    #abortController = new AbortController();
    #settingConnections = [];

    /**
     * Constructor for the PixelShift component
     * @param {object} settings - GSettings instance
     */
    constructor(settings) {
        super();
        
        try {
            this.#settings = settings;
            
            // Initialize debug mode based on settings
            const debugMode = this.#settings?.get_boolean(CONSTANTS.SETTINGS.DEBUG_MODE) ?? false;
            this.#debug = debugMode ? this.#logDebug.bind(this) : () => {};
            
            // Check if portal API is supported
            this.#usePortalAPI = this.#checkPortalSupport();
            
            // Validate required settings
            this.#validateSettings();
            
            this.#debug('PixelShift component constructed');
            
            // Start tracking performance
            metrics.setEnabled(debugMode);
        } catch (error) {
            console.error(`[OLED Care] [PixelShift] Construction error: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Set the resource manager for memory management
     * @param {ResourceManager} manager - The resource manager instance
     */
    setResourceManager(manager) {
        this.#resourceManager = manager;
        this.#debug('Resource manager set');
    }
    
    /**
     * Set the signal manager for signal tracking
     * @param {SignalManager} manager - The signal manager instance
     */
    setSignalManager(manager) {
        this.#signalManager = manager;
        this.#debug('Signal manager set');
    }

    /**
     * Validate required settings
     * @private
     * @throws {PixelShiftError} If settings validation fails
     */
    #validateSettings() {
        if (!this.#settings) {
            throw new PixelShiftError('Settings object is null or undefined', {
                context: 'validation'
            });
        }

        const schemas = this.#settings.list_keys();
        
        for (const setting of PixelShift.REQUIRED_SETTINGS) {
            if (!schemas.includes(setting)) {
                this.#debug(`Warning: Required setting '${setting}' not found in schema`);
            }
        }
    }

    /**
     * Log a debug message
     * @param {string} message - Message to log
     * @private
     */
    #logDebug(message) {
        console.log(`[OLED Care] [PixelShift] ${message}`);
        
        // Track debug message in metrics
        metrics.incrementCounter('debug_messages', 1, { component: 'PixelShift' });
    }

    /**
     * Check if portal API is supported
     * @returns {boolean} True if portal API is supported
     * @private
     */
    #checkPortalSupport() {
        try {
            const proxy = Main.shellDBusService?.shellProxy;
            const supported = proxy !== null;
            this.#debug(`Portal API support: ${supported}`);
            return supported;
        } catch (error) {
            this.#debug(`Portal API detection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Initialize the component
     */
    init() {
        const initTimer = metrics.startTimer('pixelshift_init');
        
        try {
            this.#debug('Initializing pixel shift');
            
            // Initialize based on current settings
            if (this.#settings?.get_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED) ?? false) {
                this.#startPixelShift();
            }

            // Connect to settings changes
            this.#connectSettingsSignals();
            
            this.#debug('Pixel shift initialized');
            initTimer.stop();
        } catch (error) {
            initTimer.addLabels({ error: true });
            initTimer.stop();
            
            this.#debug(`Error in init: ${error.message}`);
            throw PixelShiftError.operationFailed('init', error);
        }
    }
    
    /**
     * Connect to settings change signals
     * @private
     */
    #connectSettingsSignals() {
        if (!this.#signalManager || !this.#settings) return;
        
        // Connect to pixel shift enabled setting
        const enabledId = this.#signalManager.connect(
            this.#settings,
            `changed::${CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED}`,
            () => {
                if (this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED)) {
                    this.#startPixelShift();
                } else {
                    this.#stopPixelShift();
                }
            },
            'pixel-shift-enabled'
        );
        
        // Connect to pixel shift interval setting
        const intervalId = this.#signalManager.connect(
            this.#settings,
            `changed::${CONSTANTS.SETTINGS.PIXEL_SHIFT_INTERVAL}`,
            () => {
                if (this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED)) {
                    this.#restartPixelShift();
                }
            },
            'pixel-shift-interval'
        );
        
        // Store connection IDs for cleanup
        this.#settingConnections.push(enabledId, intervalId);
    }

    /**
     * Enable the component
     */
    enable() {
        this.#debug('Enabling pixel shift');
        if (this.#settings?.get_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED) ?? false) {
            this.#startPixelShift();
        }
    }

    /**
     * Disable the component
     */
    disable() {
        this.#debug('Disabling pixel shift');
        this.#stopPixelShift();
    }

    /**
     * Update based on settings changes
     */
    update() {
        this.#debug('Updating pixel shift settings');
        this.#restartPixelShift();
    }

    /**
     * Clean up resources before destruction
     */
    async destroy() {
        this.#debug('Destroying pixel shift');
        
        // Cancel any pending operations
        this.#abortController.abort('Component destruction');
        
        // Stop pixel shifting
        this.#stopPixelShift();
        
        // Disconnect any remaining signals via signal manager
        if (this.#signalManager) {
            for (const id of this.#settingConnections) {
                this.#signalManager.disconnect(id);
            }
            this.#settingConnections = [];
        }
        
        this.#debug('Pixel shift destroyed');
    }

    /**
     * Start pixel shifting
     * @private
     */
    #startPixelShift() {
        const timer = metrics.startTimer('start_pixel_shift');
        
        try {
            this.#debug('Starting pixel shift');
            
            // Stop any existing shift first
            this.#stopPixelShift();
            
            // Get interval from settings with fallback to 60 seconds
            const interval = this.#settings?.get_int(CONSTANTS.SETTINGS.PIXEL_SHIFT_INTERVAL) ?? 60;
            const intervalMs = interval * 1000;
            
            // Create new timeout
            this.#pixelShiftTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
                try {
                    return this.#shiftPixels();
                } catch (error) {
                    this.#debug(`Error in pixel shift: ${error.message}`);
                    return GLib.SOURCE_CONTINUE; // Continue despite errors
                }
            });
            
            // Track timeout resource if we have a resource manager
            if (this.#resourceManager) {
                this.#resourceManager.track(
                    { id: this.#pixelShiftTimeout },
                    (resource) => {
                        if (resource?.id) {
                            GLib.source_remove(resource.id);
                        }
                    },
                    'timeout',
                    { name: 'pixelShiftTimeout', type: 'timeout' }
                );
            }
            
            this.#debug(`Pixel shift started with ${interval} second interval`);
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error starting pixel shift: ${error.message}`);
            throw PixelShiftError.operationFailed('start', error);
        }
    }

    /**
     * Stop pixel shifting
     * @private
     */
    #stopPixelShift() {
        const timer = metrics.startTimer('stop_pixel_shift');
        
        try {
            this.#debug('Stopping pixel shift');
            
            // Remove timeout if it exists
            if (this.#pixelShiftTimeout) {
                GLib.source_remove(this.#pixelShiftTimeout);
                this.#pixelShiftTimeout = null;
            }
            
            // Reset any existing shift
            this.#resetShift();
            
            this.#debug('Pixel shift stopped');
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error stopping pixel shift: ${error.message}`);
        }
    }

    /**
     * Restart pixel shifting
     * @private
     */
    #restartPixelShift() {
        this.#debug('Restarting pixel shift');
        this.#stopPixelShift();
        this.#startPixelShift();
    }

    /**
     * Perform the actual pixel shift
     * @returns {number} GLib source continuation flag
     * @private
     */
    #shiftPixels() {
        const timer = metrics.startTimer('shift_pixels_operation');
        
        try {
            // Calculate new shift position
            const newShift = this.#calculateNextShift();
            this.#debug(`Shifting pixels to x:${newShift.x}, y:${newShift.y}`);
            
            // Apply shift based on available API
            if (this.#usePortalAPI) {
                this.#applyShiftPortal(newShift);
            } else {
                this.#applyShiftNew(newShift);
            }
            
            // Update current shift position
            this.#currentShift = newShift;
            
            // Track successful shift
            metrics.incrementCounter('pixel_shifts');
            
            timer.stop();
            
            // Check if we exceeded performance budget
            const duration = timer.getDuration();
            if (duration > CONSTANTS.PERFORMANCE_BUDGET.SHIFT_OPERATION) {
                this.#debug(`Performance warning: Shift operation took ${duration.toFixed(2)}ms, budget is ${CONSTANTS.PERFORMANCE_BUDGET.SHIFT_OPERATION}ms`);
                metrics.incrementCounter('performance_budget_exceeded', 1, { operation: 'shift_pixels' });
            }
            
            return GLib.SOURCE_CONTINUE;
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error shifting pixels: ${error.message}`);
            metrics.incrementCounter('pixel_shift_errors');
            
            // Continue despite errors to maintain the shifting cycle
            return GLib.SOURCE_CONTINUE;
        }
    }

    /**
     * Reset any active shift
     * @private
     */
    #resetShift() {
        // Only reset if there's an active shift
        if (this.#currentShift.x !== 0 || this.#currentShift.y !== 0) {
            const zeroShift = { x: 0, y: 0 };
            
            try {
                // Apply zero shift based on available API
                if (this.#usePortalAPI) {
                    this.#applyShiftPortal(zeroShift);
                } else {
                    this.#applyShiftNew(zeroShift);
                }
                
                this.#currentShift = zeroShift;
                this.#debug('Shift reset to zero');
            } catch (error) {
                this.#debug(`Error resetting shift: ${error.message}`);
            }
        }
    }

    /**
     * Calculate the next shift position
     * @returns {object} New shift position {x, y}
     * @private
     */
    #calculateNextShift() {
        // Initialize new shift object
        const newShift = { x: 0, y: 0 };
        
        // Randomly choose a direction (0: right, 1: left, 2: down, 3: up)
        const direction = Math.floor(Math.random() * 4);
        
        switch (direction) {
            case 0: // right
                newShift.x = CONSTANTS.PIXEL_SHIFT_AMOUNT;
                break;
            case 1: // left
                newShift.x = -CONSTANTS.PIXEL_SHIFT_AMOUNT;
                break;
            case 2: // down
                newShift.y = CONSTANTS.PIXEL_SHIFT_AMOUNT;
                break;
            case 3: // up
                newShift.y = -CONSTANTS.PIXEL_SHIFT_AMOUNT;
                break;
        }
        
        // If the new shift is the same as the current one, try again
        if (newShift.x === this.#currentShift.x && newShift.y === this.#currentShift.y) {
            return this.#calculateNextShift();
        }
        
        return newShift;
    }

    /**
     * Apply shift using portal API (GNOME 47+)
     * @param {object} shift - Shift position {x, y}
     * @private
     */
    #applyShiftPortal(shift) {
        const monitors = Main.layoutManager.monitors;
        monitors.forEach(monitor => {
            try {
                const monitorConfig = Meta.MonitorManager.get()?.get_monitor_config(monitor.index);
                if (!monitorConfig) return;

                monitorConfig.set_position_offset(shift.x, shift.y);
            } catch (error) {
                this.#debug(`Error applying portal shift to monitor ${monitor.index}: ${error.message}`);
                metrics.incrementCounter('shift_errors', 1, { api: 'portal', monitor: monitor.index });
            }
        });
    }

    /**
     * Apply shift using new API (GNOME 46+)
     * @param {object} shift - Shift position {x, y}
     * @private
     */
    #applyShiftNew(shift) {
        const monitorManager = Meta.MonitorManager.get();
        Main.layoutManager.monitors.forEach(monitor => {
            try {
                const connector = monitorManager?.get_monitor_connector(monitor.index);
                if (!connector) return;

                connector.set_position_offset(shift.x, shift.y);
            } catch (error) {
                this.#debug(`Error applying new API shift to monitor ${monitor.index}: ${error.message}`);
                metrics.incrementCounter('shift_errors', 1, { api: 'new', monitor: monitor.index });
            }
        });
    }
} 