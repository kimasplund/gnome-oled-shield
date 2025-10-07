'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

// Import modules conditionally based on environment
const isTestEnv = GLib.getenv('G_TEST_SRCDIR') !== null;

const Main = isTestEnv 
    ? (await import('../tests/unit/mocks/main.js')).Main 
    : (await import('resource:///org/gnome/shell/ui/main.js')).Main;

const { BrightnessContrastEffect } = isTestEnv
    ? await import('../tests/unit/mocks/clutter.js')
    : await import('gi://Clutter');

/**
 * Custom error classes for better error handling
 */
class DimmingError extends Error {
    constructor(message, options = {}) {
        // Using Error.cause for better error chaining (ES2022)
        super(message, { cause: options.cause });
        this.name = 'DimmingError';
        
        // Add additional context if provided
        this.context = options.context ?? null;
        this.timestamp = new Date();
    }
    
    /**
     * Format the error with additional context for logging
     * @returns {string} Formatted error message
     */
    format() {
        const contextInfo = this.context ? ` (Context: ${this.context})` : '';
        const causeInfo = this.cause ? `\n  Caused by: ${this.cause.message}` : '';
        return `${this.name}: ${this.message}${contextInfo}${causeInfo}`;
    }
}

class SettingsValidationError extends DimmingError {
    constructor(key, type, options = {}) {
        super(`Failed to validate setting: ${key} (${type})`, options);
        this.name = 'SettingsValidationError';
        this.key = key;
        this.type = type;
    }
}

class EffectApplicationError extends DimmingError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'EffectApplicationError';
    }
}

/**
 * Resource Manager using FinalizationRegistry for automatic cleanup
 */
class ResourceManager {
    // Private fields
    #registry;
    #resources = new Map();
    #debug;
    
    /**
     * Create a new resource manager
     * @param {Function} debugFn - Debug logging function
     */
    constructor(debugFn) {
        this.#debug = debugFn || (() => {});
        
        // Create finalization registry for automatic cleanup
        this.#registry = new FinalizationRegistry((resourceId) => {
            this.#cleanupResource(resourceId);
        });
    }
    
    /**
     * Track a resource for automatic cleanup
     * @param {object} resource - The resource to track
     * @param {Function} cleanupFn - Function to call for cleanup
     * @returns {string} Resource ID for manual cleanup
     */
    track(resource, cleanupFn) {
        if (!resource || !cleanupFn || typeof cleanupFn !== 'function') {
            this.#debug('Invalid resource or cleanup function');
            return null;
        }
        
        // Generate unique ID for this resource
        const resourceId = `res-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Store weak reference to resource and cleanup function
        this.#resources.set(resourceId, {
            resourceRef: new WeakRef(resource),
            cleanupFn
        });
        
        // Register for cleanup when resource is garbage collected
        this.#registry.register(resource, resourceId);
        
        this.#debug(`Tracked resource: ${resourceId}`);
        return resourceId;
    }
    
    /**
     * Manually cleanup a tracked resource
     * @param {string} resourceId - ID of the resource to clean up
     * @returns {boolean} True if successfully cleaned up
     */
    cleanup(resourceId) {
        return this.#cleanupResource(resourceId);
    }
    
    /**
     * Clean up all tracked resources
     */
    cleanupAll() {
        // Get a snapshot of resource IDs to avoid modification during iteration
        const resourceIds = Array.from(this.#resources.keys());
        
        // Use Promise.allSettled to handle all cleanups even if some fail
        return Promise.allSettled(
            resourceIds.map(id => this.#cleanupResource(id))
        ).then(results => {
            // Using modern Array methods and Object.groupBy for analysis
            const resultGroups = Object.groupBy(results, r => r.status);
            const successCount = resultGroups.fulfilled?.filter(r => r.value === true).length ?? 0;
            const failureCount = (resultGroups.rejected?.length ?? 0) + 
                                (resultGroups.fulfilled?.filter(r => r.value !== true).length ?? 0);
            
            if (failureCount > 0) {
                this.#debug(`Failed to clean up ${failureCount} resources, ${successCount} succeeded`);
            }
            
            return failureCount === 0;
        });
    }
    
    /**
     * Internal method to clean up a resource
     * @param {string} resourceId - ID of the resource to clean up
     * @returns {boolean} True if successfully cleaned up
     * @private
     */
    #cleanupResource(resourceId) {
        try {
            const resourceData = this.#resources.get(resourceId);
            // Early return with optional chaining
            if (!resourceData) {
                this.#debug(`Resource not found: ${resourceId}`);
                return false;
            }
            
            // Get the resource from weak reference
            const resource = resourceData.resourceRef.deref();
            if (resource) {
                // Call cleanup function if resource still exists
                resourceData.cleanupFn(resource);
            }
            
            // Remove from tracked resources
            this.#resources.delete(resourceId);
            this.#debug(`Cleaned up resource: ${resourceId}`);
            return true;
        } catch (error) {
            this.#debug(`Error cleaning up resource ${resourceId}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Get the number of tracked resources
     * @returns {number} The number of tracked resources
     */
    get size() {
        return this.#resources.size;
    }
}

/**
 * Screen dimming functionality for OLED displays
 * Manages screen dimming effects to reduce OLED panel wear
 */
@GObject.registerClass({
    GTypeName: 'OledCareDimming'
})
export default class Dimming extends GObject.Object {
    // Static initialization block for constants and configuration
    static {
        this.DEBUG_MODE_KEY = 'debug-mode';
        this.SCREEN_DIM_ENABLED_KEY = 'screen-dim-enabled';
        this.DIMMING_LEVEL_KEY = 'dimming-level';
        this.SCREEN_DIM_TIMEOUT_KEY = 'screen-dim-timeout';
        
        // Define required settings keys by type
        this.REQUIRED_BOOLEAN_KEYS = [
            this.DEBUG_MODE_KEY,
            this.SCREEN_DIM_ENABLED_KEY
        ];
        
        this.REQUIRED_INT_KEYS = [
            this.DIMMING_LEVEL_KEY,
            this.SCREEN_DIM_TIMEOUT_KEY
        ];
        
        // All required settings combined
        this.ALL_REQUIRED_KEYS = [
            ...this.REQUIRED_BOOLEAN_KEYS,
            ...this.REQUIRED_INT_KEYS
        ];
        
        // Error messages as a frozen object for consistency
        this.ERROR_MESSAGES = Object.freeze({
            INIT_FAILED: 'Failed to initialize dimming component',
            MISSING_SETTING: 'Missing required setting',
            APPLY_ERROR: 'Error applying dimming effect',
            REMOVE_ERROR: 'Error removing dimming effect',
            SCHEDULE_ERROR: 'Error scheduling dimming',
            CANCEL_ERROR: 'Error canceling scheduled dimming'
        });
        
        // Default configuration values
        this.DEFAULTS = Object.freeze({
            DIMMING_LEVEL: 30,
            TIMEOUT: 300,
            DEBUG: false
        });
    }

    // Private fields
    #settings;
    #debug;
    #enabled = false;
    #resourceManager;
    #dimmingEffect = null;
    #dimmingTimeoutId = null;
    #dimmingActive = false;
    #abortController = new AbortController();
    #lastPerformanceMetrics = null;
    
    // Use private accessors for better encapsulation of state
    get #isDimmingActive() { return this.#dimmingActive; }
    set #isDimmingActive(value) { 
        this.#dimmingActive = Boolean(value);
        // Use this opportunity to update metrics
        this.#lastPerformanceMetrics ??= {}; // Nullish assignment to initialize if needed
        this.#lastPerformanceMetrics.lastStateChange = new Date();
    }

    /**
     * Constructor for the Dimming component
     * @param {object} settings - GSettings instance
     */
    constructor(settings) {
        super();
        
        try {
            // Store settings
            this.#settings = settings;
            
            // Initialize debug mode
            this.#debug = settings?.get_boolean(Dimming.DEBUG_MODE_KEY) ?? Dimming.DEFAULTS.DEBUG
                ? this.#logDebug.bind(this)
                : () => {};
            
            // Initialize resource manager
            this.#resourceManager = new ResourceManager(this.#debug);
            
            // Validate settings
            this.#validateSettings();
            
            // Set initial state based on settings
            this.#enabled = this.#settings?.get_boolean(Dimming.SCREEN_DIM_ENABLED_KEY) ?? false;
            
            this.#debug('Dimming component initialized');
        } catch (error) {
            // Using Error.cause for better error chaining
            throw new DimmingError(Dimming.ERROR_MESSAGES.INIT_FAILED, { 
                cause: error,
                context: 'constructor'
            });
        }
    }
    
    /**
     * Validate required settings
     * @private
     * @throws {SettingsValidationError} If settings validation fails
     */
    #validateSettings() {
        // Using optional chaining to avoid errors if settings is null
        if (!this.#settings) {
            throw new SettingsValidationError('settings', 'object', {
                context: 'validation',
                cause: new Error('Settings object is null or undefined')
            });
        }
        
        // Validate boolean settings
        for (const key of Dimming.REQUIRED_BOOLEAN_KEYS) {
            try {
                // Access safely with optional chaining
                const _ = this.#settings?.get_boolean(key);
            } catch (error) {
                throw new SettingsValidationError(key, 'boolean', { cause: error });
            }
        }
        
        // Validate integer settings
        for (const key of Dimming.REQUIRED_INT_KEYS) {
            try {
                // Access safely with optional chaining
                const _ = this.#settings?.get_int(key);
            } catch (error) {
                throw new SettingsValidationError(key, 'integer', { cause: error });
            }
        }
    }
    
    /**
     * Apply dimming effect to the screen
     * @returns {Promise<boolean>} True if successful
     */
    async applyDimming() {
        // Skip if already active
        if (this.#isDimmingActive) {
            this.#debug('Dimming already active, skipping');
            return true;
        }
        
        this.#debug('Applying screen dimming');
        
        try {
            // Cancel any pending dimming operations
            this.cancelScheduledDimming();
            
            // Create a new abort controller for this operation
            this.#abortController = new AbortController();
            const { signal } = this.#abortController;
            
            // Get brightness level from settings with fallback defaults
            const dimmingLevel = this.#settings?.get_int(Dimming.DIMMING_LEVEL_KEY) ?? 
                                Dimming.DEFAULTS.DIMMING_LEVEL;
            
            // Calculate brightness and contrast values
            const brightness = 1 - (dimmingLevel / 100);
            
            // Create and apply effect
            this.#dimmingEffect = new BrightnessContrastEffect({
                brightness: brightness,
                name: 'oled-care-dimming'
            });
            
            // Apply to global UI
            if (Main.uiGroup) {
                Main.uiGroup.add_effect(this.#dimmingEffect);
                
                // Wait a bit to ensure effect is applied
                await new Promise(resolve => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                        resolve(true);
                        return GLib.SOURCE_REMOVE;
                    });
                });
                
                // Track this effect for cleanup
                this.#resourceManager.track(
                    this.#dimmingEffect,
                    (effect) => {
                        try {
                            if (Main.uiGroup && effect) {
                                Main.uiGroup.remove_effect(effect);
                            }
                        } catch (e) {
                            this.#debug(`Error removing effect: ${e.message}`);
                        }
                    }
                );
                
                // Set state
                this.#isDimmingActive = true;
                
                this.#debug(`Dimming applied at level ${dimmingLevel}%`);
                return true;
            } else {
                throw new EffectApplicationError('Main.uiGroup not available', {
                    context: 'apply'
                });
            }
        } catch (error) {
            this.#debug(`Error applying dimming: ${error.message}`);
            
            // Clean up any partial effect
            if (this.#dimmingEffect && Main.uiGroup) {
                try {
                    Main.uiGroup.remove_effect(this.#dimmingEffect);
                } catch (_) {}
                
                this.#dimmingEffect = null;
            }
            
            this.#isDimmingActive = false;
            
            throw new EffectApplicationError(Dimming.ERROR_MESSAGES.APPLY_ERROR, {
                cause: error,
                context: 'apply' 
            });
        }
    }
    
    /**
     * Schedule dimming after timeout
     * @returns {Promise<boolean>} True if scheduled successfully
     */
    async scheduleDimming() {
        // Skip if already scheduled or active
        if (this.#dimmingTimeoutId || this.#isDimmingActive) {
            this.#debug('Dimming already scheduled or active, skipping');
            return true;
        }
        
        // Skip if not enabled
        if (!this.#enabled) {
            this.#debug('Dimming not enabled, skipping scheduling');
            return false;
        }
        
        try {
            // Get timeout from settings
            const timeout = this.#settings?.get_int(Dimming.SCREEN_DIM_TIMEOUT_KEY) ?? 
                           Dimming.DEFAULTS.TIMEOUT;
            
            this.#debug(`Scheduling dimming with ${timeout} second timeout`);
            
            // Set up timeout
            this.#dimmingTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                timeout,
                () => {
                    this.#debug('Dimming timeout triggered');
                    this.#dimmingTimeoutId = null;
                    
                    // Apply dimming and handle errors
                    this.applyDimming().catch(error => {
                        this.#debug(`Scheduled dimming failed: ${error.message}`);
                    });
                    
                    return GLib.SOURCE_REMOVE;
                }
            );
            
            // Track the timeout for cleanup
            this.#resourceManager.track(
                { id: this.#dimmingTimeoutId },
                (resource) => {
                    if (resource?.id) {
                        GLib.source_remove(resource.id);
                    }
                }
            );
            
            return true;
        } catch (error) {
            this.#debug(`Error scheduling dimming: ${error.message}`);
            
            // Cleanup any partial scheduling
            this.cancelScheduledDimming();
            
            throw new DimmingError(Dimming.ERROR_MESSAGES.SCHEDULE_ERROR, {
                cause: error,
                context: 'schedule'
            });
        }
    }
    
    /**
     * Clean up all resources
     */
    async destroy() {
        this.#debug('Destroying Dimming component');
        
        // Cancel any pending operations
        this.#abortController.abort();
        
        // Cancel any scheduled dimming
        this.cancelScheduledDimming();
        
        // Remove dimming effect
        if (this.#isDimmingActive) {
            try {
                await this.removeDimming();
            } catch (error) {
                this.#debug(`Error removing dimming during cleanup: ${error.message}`);
            }
        }
        
        // Clean up all resources
        await this.#resourceManager.cleanupAll();
        
        this.#debug('Dimming component destroyed');
    }
    
    /**
     * Log a debug message
     * @param {string} message - Message to log
     * @private
     */
    #logDebug(message) {
        console.log(`[OLED Care] [Dimming] ${message}`);
    }
    
    /**
     * Cancel any scheduled dimming operation
     * @returns {boolean} True if a scheduled dimming was canceled
     */
    cancelScheduledDimming() {
        // Using optional chaining for safer access
        if (this.#dimmingTimeoutId) {
            try {
                GLib.source_remove(this.#dimmingTimeoutId);
                this.#debug(`Cancelled scheduled dimming (id: ${this.#dimmingTimeoutId})`);
                
                // Reset timeout ID
                this.#dimmingTimeoutId = null;
                return true;
            } catch (error) {
                this.#debug(`Error canceling dimming: ${error.message}`);
                
                // Reset timeout ID even on error
                this.#dimmingTimeoutId = null;
                
                throw new DimmingError(Dimming.ERROR_MESSAGES.CANCEL_ERROR, {
                    cause: error,
                    context: 'cancel'
                });
            }
        }
        
        // Nothing to cancel
        return false;
    }
    
    /**
     * Remove dimming effect from screen
     * @returns {Promise<boolean>} True if successfully removed
     */
    async removeDimming() {
        // Skip if not active
        if (!this.#isDimmingActive || !this.#dimmingEffect) {
            this.#debug('No active dimming to remove');
            return true;
        }
        
        this.#debug('Removing screen dimming');
        
        try {
            // Check if we can access the UI group
            if (Main.uiGroup && this.#dimmingEffect) {
                // Remove the effect
                Main.uiGroup.remove_effect(this.#dimmingEffect);
                
                // Wait a bit to ensure effect is removed
                await new Promise(resolve => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                        resolve(true);
                        return GLib.SOURCE_REMOVE;
                    });
                });
                
                // Update state
                this.#dimmingEffect = null;
                this.#isDimmingActive = false;
                
                this.#debug('Dimming removed successfully');
                return true;
            } else {
                // No active effect or UI group not available
                this.#isDimmingActive = false;
                this.#dimmingEffect = null;
                return true;
            }
        } catch (error) {
            this.#debug(`Error removing dimming: ${error.message}`);
            
            // Make sure we reset state even on error
            this.#dimmingEffect = null;
            this.#isDimmingActive = false;
            
            throw new EffectApplicationError(Dimming.ERROR_MESSAGES.REMOVE_ERROR, {
                cause: error,
                context: 'remove'
            });
        }
    }
    
    /**
     * Initialize the dimming component
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        this.#debug('Initializing dimming component');
        // Component is constructed and ready, no additional async initialization needed
        return Promise.resolve(true);
    }
    
    /**
     * Enable dimming functionality
     */
    enable() {
        this.#debug('Enabling dimming');
        this.#enabled = true;
        
        // If screen dim is enabled in settings, schedule it
        if (this.#settings?.get_boolean(Dimming.SCREEN_DIM_ENABLED_KEY) ?? false) {
            this.scheduleDimming().catch(error => {
                this.#debug(`Error scheduling dimming: ${error.message}`);
            });
        }
    }
    
    /**
     * Disable dimming functionality
     */
    disable() {
        this.#debug('Disabling dimming');
        this.#enabled = false;
        
        // Cancel any scheduled dimming
        this.cancelScheduledDimming();
        
        // Remove any active dimming
        if (this.#isDimmingActive) {
            this.removeDimming().catch(error => {
                this.#debug(`Error removing dimming: ${error.message}`);
            });
        }
    }
    
    /**
     * Enable dimming in limited mode (for lock screen)
     */
    enableLimited() {
        this.#debug('Enabling dimming in limited mode');
        this.#enabled = true;
        
        // In limited mode, we don't schedule automatic dimming
        // But dimming can still be applied programmatically if needed
    }
    
    /**
     * Get current status of dimming
     * @returns {object} Status information
     */
    getStatus() {
        return {
            enabled: this.#enabled,
            active: this.#isDimmingActive,
            scheduled: this.#dimmingTimeoutId !== null
        };
    }
}
