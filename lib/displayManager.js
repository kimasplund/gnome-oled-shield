'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Import error handling and utilities
import { ExtensionError, DisplayError } from './errors.js';
import { metrics } from './metrics.js';
import ResourceManager from './resourceManager.js';
import SignalManager from './signalManager.js';
import EventEmitter from './eventEmitter.js';

/**
 * Manages display settings and protection for OLED displays
 * Provides unified interface for monitor management
 */
export default class DisplayManager extends EventEmitter {
    // Static initialization block for constants
    static {
        this.SETTINGS = Object.freeze({
            DEBUG_MODE: 'debug-mode',
            ENABLED_DISPLAYS: 'enabled-displays',
            DISPLAY_BRIGHTNESS: 'display-brightness',
            DISPLAY_CONTRAST: 'display-contrast',
            DISPLAY_PROTECTION: 'display-protection'
        });
        
        this.REQUIRED_SETTINGS = Object.freeze(Object.values(this.SETTINGS));
        
        this.DEFAULTS = Object.freeze({
            BRIGHTNESS: 50,
            CONTRAST: 50
        });
        
        this.STATUS = Object.freeze({
            IDLE: 'idle',
            ACTIVE: 'active',
            ERROR: 'error',
            DISABLED: 'disabled'
        });
        
        this.DISPLAY_TYPES = Object.freeze({
            OLED: 'oled',
            LCD: 'lcd',
            UNKNOWN: 'unknown'
        });
        
        // Known OLED display patterns
        this.OLED_PATTERNS = Object.freeze([
            /OLED/i,
            /AMOLED/i,
            /AMOLED\+/i,
            /POLED/i,
            /PMOLED/i
        ]);
    }

    // Private fields using true private syntax
    #settings;
    #monitors = [];
    #monitorManager;
    #usePortalAPI = false;
    #protectedDisplays = new Map(); // Track protection state
    #displaySelectorDialog = null;
    #debug;
    #resourceManager = null;
    #signalManager = null;
    #monitorChangedId = null;
    #settingsConnections = [];
    #abortController = new AbortController();
    #resourceBundle = null;
    #isEnabled = false;
    #status = DisplayManager.STATUS.IDLE;
    #displayTypes = new Map();
    #brightnessLevels = new Map();
    #contrastLevels = new Map();
    #limitedMode = false;
    #primaryMonitor = null;
    #detectionPromise = null;

    /**
     * Constructor for the DisplayManager component
     * @param {object} settings - GSettings instance
     */
    constructor(settings) {
        super();
        
        try {
            this.#settings = settings;
            this.#monitorManager = Meta.MonitorManager.get();
            
            // Initialize debug mode based on settings
            const debugMode = this.#settings?.get_boolean(DisplayManager.SETTINGS.DEBUG_MODE) ?? false;
            this.#debug = debugMode ? this.#logDebug.bind(this) : () => {};
            
            // Start performance tracking
            metrics.setEnabled(debugMode);
            
            // Check for monitor manager
            if (!this.#monitorManager) {
                throw new DisplayError('Monitor manager unavailable', {
                    context: 'initialization',
                    level: ExtensionError.ERROR_LEVELS.CRITICAL
                });
            }
            
            // Validate settings early
            this.#validateSettings();
            this.#detectPortalSupport();
            
            // Set properties
            this.set_active(false);
            
            this.#debug('DisplayManager constructed successfully');
        } catch (error) {
            console.error(`[OLED Care] [DisplayManager] Construction error: ${error.message}`);
            this.#status = DisplayManager.STATUS.ERROR;
            throw error instanceof DisplayError ? error : new DisplayError(
                'Construction failed',
                { cause: error, context: 'construction', level: ExtensionError.ERROR_LEVELS.CRITICAL }
            ); 
        }
    }
    
    /**
     * Get the current status of the display manager
     * @returns {string} Current status
     */
    getStatus() {
        return this.#status;
    }
    
    /**
     * Set the resource manager for memory management
     * @param {ResourceManager} manager - The resource manager instance
     */
    setResourceManager(manager) {
        if (!(manager instanceof ResourceManager)) {
            throw new DisplayError('Invalid resource manager', { 
                context: 'dependency',
                level: ExtensionError.ERROR_LEVELS.ERROR 
            });
        }
        
        this.#resourceManager = manager;
        this.#resourceBundle = manager.createBundle('displayManager');
        this.#debug('Resource manager set');
        return this;
    }
    
    /**
     * Set the signal manager for signal tracking
     * @param {SignalManager} manager - The signal manager instance
     */
    setSignalManager(manager) {
        if (!(manager instanceof SignalManager)) {
            throw new DisplayError('Invalid signal manager', { 
                context: 'dependency',
                level: ExtensionError.ERROR_LEVELS.ERROR 
            });
        }
        
        this.#signalManager = manager;
        this.#debug('Signal manager set');
        return this;
    }

    /**
     * Validate required settings
     * @private
     * @throws {DisplayError} If settings validation fails
     */
    #validateSettings() {
        const timer = metrics.startTimer('validate_settings');
        
        try {
            if (!this.#settings) {
                throw new DisplayError('Settings object is null or undefined', {
                    context: 'validation',
                    level: ExtensionError.ERROR_LEVELS.CRITICAL
                });
            }

            const schemas = this.#settings.list_keys();
            
            // Check required settings
            for (const setting of DisplayManager.REQUIRED_SETTINGS) {
                if (!schemas.includes(setting)) {
                    this.#debug(`Warning: Required setting '${setting}' not found in schema`);
                }
            }

            // Validate brightness and contrast ranges
            const brightness = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_BRIGHTNESS);
            const contrast = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_CONTRAST);

            if (brightness < 0 || brightness > 100) {
                this.#debug(`Warning: Invalid brightness value ${brightness}, resetting to ${DisplayManager.DEFAULTS.BRIGHTNESS}`);
                this.#settings.set_int(DisplayManager.SETTINGS.DISPLAY_BRIGHTNESS, DisplayManager.DEFAULTS.BRIGHTNESS);
            }

            if (contrast < 0 || contrast > 100) {
                this.#debug(`Warning: Invalid contrast value ${contrast}, resetting to ${DisplayManager.DEFAULTS.CONTRAST}`);
                this.#settings.set_int(DisplayManager.SETTINGS.DISPLAY_CONTRAST, DisplayManager.DEFAULTS.CONTRAST);
            }
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            // Re-throw with proper error type
            if (!(error instanceof DisplayError)) {
                throw new DisplayError(
                    'Settings validation failed',
                    { cause: error, context: 'validation', level: ExtensionError.ERROR_LEVELS.ERROR }
                );
            }
            throw error;
        }
    }

    /**
     * Detect if portal API is supported
     * @private
     */
    #detectPortalSupport() {
        try {
            const proxy = Main.shellDBusService?.shellProxy;
            this.#usePortalAPI = !!proxy;
            this.#debug(`Portal API support: ${this.#usePortalAPI}`);
        } catch (error) {
            this.#debug(`Portal API detection failed: ${error.message}`);
            this.#usePortalAPI = false;
        }
    }

    /**
     * Log a debug message
     * @param {string} message - Message to log
     * @private
     */
    #logDebug(message) {
        console.log(`[OLED Care] [DisplayManager] ${message}`);
        
        // Track debug message in metrics
        metrics.incrementCounter('debug_messages', 1, { component: 'DisplayManager' });
    }

    /**
     * Initialize the display manager
     * @returns {Promise<void>}
     */
    async init() {
        const timer = metrics.startTimer('displaymanager_init');
        
        try {
            this.#status = DisplayManager.STATUS.IDLE;
            
            // Load existing display settings
            await this.#loadEnabledDisplays();
            
            // Connect signals for monitor changes and settings changes
            this.#connectSignals();
            this.#connectSettingsSignals();
            
            // Read brightness and contrast settings
            this.#loadDisplaySettings();
            
            // Update with current monitors
            await this.refresh();
            
            timer.stop();
            this.#debug('Display manager initialized');
            
            // Emit ready event
            this.emit('ready');
            
            return true;
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#status = DisplayManager.STATUS.ERROR;
            this.#debug(`Error initializing display manager: ${error.message}`);
            
            // Emit error event
            this.emit('error', error);
            
            throw error instanceof DisplayError ? error : new DisplayError(
                'Initialization failed',
                { cause: error, context: 'initialization', level: ExtensionError.ERROR_LEVELS.ERROR }
            );
        }
    }
    
    /**
     * Connect to settings change signals
     * @private
     */
    #connectSettingsSignals() {
        if (!this.#signalManager || !this.#settings) return;
        
        try {
            // Connect to brightness changes
            const brightnessSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${DisplayManager.SETTINGS.DISPLAY_BRIGHTNESS}`,
                this.#onBrightnessChanged.bind(this),
                'brightness-changed'
            );
            
            // Connect to contrast changes
            const contrastSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${DisplayManager.SETTINGS.DISPLAY_CONTRAST}`,
                this.#onContrastChanged.bind(this),
                'contrast-changed'
            );
            
            // Connect to enabled displays changes
            const displaysSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${DisplayManager.SETTINGS.ENABLED_DISPLAYS}`,
                this.#onEnabledDisplaysChanged.bind(this),
                'enabled-displays-changed'
            );
            
            // Store signal IDs for cleanup
            this.#settingsConnections.push(brightnessSignalId, contrastSignalId, displaysSignalId);
            
            this.#debug('Connected to settings signals');
        } catch (error) {
            this.#debug(`Error connecting to settings signals: ${error.message}`);
            throw new DisplayError(
                'Failed to connect settings signals',
                { cause: error, context: 'signals', level: ExtensionError.ERROR_LEVELS.WARNING }
            );
        }
    }
    
    /**
     * Connect to monitor change signals
     * @private
     */
    #connectSignals() {
        if (!this.#monitorManager) return;
        
        try {
            // Use signal manager if available, otherwise use normal connect
            if (this.#signalManager) {
                this.#monitorChangedId = this.#signalManager.connect(
                    this.#monitorManager,
                    'monitors-changed',
                    this.#onMonitorsChanged.bind(this),
                    'monitors-changed'
                );
            } else {
                this.#monitorChangedId = this.#monitorManager.connect(
                    'monitors-changed',
                    this.#onMonitorsChanged.bind(this)
                );
                
                // Track this connection in the resource bundle
                if (this.#resourceBundle) {
                    this.#resourceBundle.track(
                        { 
                            target: this.#monitorManager, 
                            id: this.#monitorChangedId 
                        },
                        (resource) => {
                            if (resource?.target && resource?.id) {
                                resource.target.disconnect(resource.id);
                            }
                        },
                        ResourceManager.RESOURCE_TYPES.SIGNAL,
                        { name: 'monitors-changed' }
                    );
                }
            }
            
            this.#debug('Connected to monitor signals');
        } catch (error) {
            this.#debug(`Error connecting to monitor signals: ${error.message}`);
            throw new DisplayError(
                'Failed to connect monitor signals',
                { cause: error, context: 'signals', level: ExtensionError.ERROR_LEVELS.WARNING }
            );
        }
    }
    
    /**
     * Load enabled displays from settings
     * @private
     * @returns {Promise<void>}
     */
    async #loadEnabledDisplays() {
        try {
            if (!this.#settings) return;
            
            // Get stored display IDs
            const enabledDisplays = this.#settings.get_strv(DisplayManager.SETTINGS.ENABLED_DISPLAYS) || [];
            
            // Clear existing protection state
            this.#protectedDisplays.clear();
            
            // Add each display to the protected list
            for (const displayId of enabledDisplays) {
                this.#protectedDisplays.set(displayId, true);
            }
            
            this.#debug(`Loaded ${this.#protectedDisplays.size} protected displays`);
        } catch (error) {
            this.#debug(`Error loading enabled displays: ${error.message}`);
            throw new DisplayError(
                'Failed to load enabled displays',
                { cause: error, context: 'settings', level: ExtensionError.ERROR_LEVELS.WARNING }
            );
        }
    }
    
    /**
     * Load display settings (brightness, contrast)
     * @private
     */
    #loadDisplaySettings() {
        try {
            if (!this.#settings) return;
            
            // Load brightness and contrast settings
            const brightness = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_BRIGHTNESS);
            const contrast = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_CONTRAST);
            
            this.#debug(`Loaded display settings: brightness=${brightness}, contrast=${contrast}`);
            
            // Store defaults
            this.#brightnessLevels.set('default', brightness);
            this.#contrastLevels.set('default', contrast);
        } catch (error) {
            this.#debug(`Error loading display settings: ${error.message}`);
        }
    }
    
    /**
     * Handler for brightness setting changes
     * @private
     */
    #onBrightnessChanged() {
        try {
            const brightness = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_BRIGHTNESS);
            this.#debug(`Brightness changed to ${brightness}`);
            
            // Update default brightness
            this.#brightnessLevels.set('default', brightness);
            
            // Apply to all protected displays
            this.#applyDisplaySettings();
            
            // Emit event for changes
            this.emit('brightness-changed', brightness);
        } catch (error) {
            this.#debug(`Error handling brightness change: ${error.message}`);
        }
    }
    
    /**
     * Handler for contrast setting changes
     * @private
     */
    #onContrastChanged() {
        try {
            const contrast = this.#settings.get_int(DisplayManager.SETTINGS.DISPLAY_CONTRAST);
            this.#debug(`Contrast changed to ${contrast}`);
            
            // Update default contrast
            this.#contrastLevels.set('default', contrast);
            
            // Apply to all protected displays
            this.#applyDisplaySettings();
            
            // Emit event for changes
            this.emit('contrast-changed', contrast);
        } catch (error) {
            this.#debug(`Error handling contrast change: ${error.message}`);
        }
    }
    
    /**
     * Handler for enabled displays setting changes
     * @private
     */
    #onEnabledDisplaysChanged() {
        this.#loadEnabledDisplays().then(() => {
            this.#applyDisplaySettings();
            this.emit('displays-changed', this.getEnabledDisplays());
        }).catch(error => {
            this.#debug(`Error handling enabled displays change: ${error.message}`);
        });
    }
    
    /**
     * Handler for monitor changes
     * @private
     */
    #onMonitorsChanged() {
        this.#debug('Monitors changed');
        this.refresh().catch(error => {
            this.#debug(`Error refreshing after monitors changed: ${error.message}`);
        });
    }
    
    /**
     * Apply current settings to all protected displays
     * @private
     */
    #applyDisplaySettings() {
        if (!this.#isEnabled) return;
        
        try {
            const monitors = this.#monitors;
            const brightness = this.#brightnessLevels.get('default');
            const contrast = this.#contrastLevels.get('default');
            
            for (const monitor of monitors) {
                const monitorId = this.#getMonitorId(monitor);
                
                // Skip unprotected monitors
                if (!this.#protectedDisplays.has(monitorId)) continue;
                
                // Apply settings based on monitor type
                this.#applyMonitorSettings(monitor, {
                    brightness,
                    contrast
                });
            }
        } catch (error) {
            this.#debug(`Error applying display settings: ${error.message}`);
        }
    }
    
    /**
     * Apply settings to a specific monitor
     * @param {object} monitor - Monitor object
     * @param {object} settings - Settings to apply
     * @private
     */
    #applyMonitorSettings(monitor, settings) {
        try {
            const monitorId = this.#getMonitorId(monitor);
            this.#debug(`Applying settings to monitor ${monitorId}: ${JSON.stringify(settings)}`);

            // LIMITATION: GNOME Shell does not provide direct APIs for hardware
            // brightness/contrast control. This would require:
            // - DDC/CI protocol (external monitors) via tools like ddcutil
            // - Backlight control (laptop displays) via brightnessctl
            // - Or integration with system compositor controls
            //
            // For now, we track the desired settings and emit events.
            // External tools or future GNOME Shell APIs could implement actual control.

            // Store the desired settings
            if (settings.brightness !== undefined) {
                this.#brightnessLevels.set(monitorId, settings.brightness);
            }
            if (settings.contrast !== undefined) {
                this.#contrastLevels.set(monitorId, settings.contrast);
            }

            // Emit event for monitor settings change
            // Other components (or external tools) can listen to this
            this.emit('monitor-settings-changed', monitor, settings);

            this.#debug(`Settings stored for monitor ${monitorId} (hardware control not available via GNOME Shell API)`);
        } catch (error) {
            this.#debug(`Error applying settings to monitor: ${error.message}`);
        }
    }
    
    /**
     * Get a unique ID for a monitor
     * @param {object} monitor - Monitor object
     * @returns {string} Monitor ID
     * @private
     */
    #getMonitorId(monitor) {
        try {
            // Use index as stable ID (simplest and most reliable)
            // The wrapper object from refresh() includes the index
            if (monitor.index !== undefined) {
                return `monitor-${monitor.index}`;
            }

            // Fallback: try to find monitor in array
            const index = this.#monitors.indexOf(monitor);
            if (index >= 0) {
                return `monitor-${index}`;
            }

            // Last resort: generate temporary ID
            this.#debug('Warning: Could not determine monitor index');
            return `monitor-unknown-${Math.random().toString(36).substring(2, 9)}`;
        } catch (error) {
            this.#debug(`Error getting monitor ID: ${error.message}`);
            return `monitor-error-${Math.random().toString(36).substring(2, 9)}`;
        }
    }
    
    /**
     * Detect if a monitor is likely an OLED display
     * @param {object} monitor - Monitor object
     * @returns {string} Display type
     * @private
     */
    #detectDisplayType(monitor) {
        try {
            // Check if we already determined the type
            const monitorId = this.#getMonitorId(monitor);
            if (this.#displayTypes.has(monitorId)) {
                return this.#displayTypes.get(monitorId);
            }
            
            // Get monitor information using wrapper methods
            const model = monitor.get_model?.() || '';
            const manufacturer = monitor.get_manufacturer?.() || '';
            const displayName = monitor.get_display_name?.() || '';
            
            // Combine all available info
            const displayInfo = `${manufacturer} ${model} ${displayName}`.toLowerCase();
            
            // Check against known OLED patterns
            for (const pattern of DisplayManager.OLED_PATTERNS) {
                if (pattern.test(displayInfo)) {
                    this.#displayTypes.set(monitorId, DisplayManager.DISPLAY_TYPES.OLED);
                    return DisplayManager.DISPLAY_TYPES.OLED;
                }
            }
            
            // Default to unknown
            this.#displayTypes.set(monitorId, DisplayManager.DISPLAY_TYPES.UNKNOWN);
            return DisplayManager.DISPLAY_TYPES.UNKNOWN;
        } catch (error) {
            this.#debug(`Error detecting display type: ${error.message}`);
            return DisplayManager.DISPLAY_TYPES.UNKNOWN;
        }
    }
    
    /**
     * Enable the display manager
     */
    enable() {
        this.#debug('Enabling display manager');
        this.#limitedMode = false;
        this.#isEnabled = true;
        this.#status = DisplayManager.STATUS.ACTIVE;
        this.set_active(true);
        
        // Apply current settings
        this.#applyDisplaySettings();
        
        // Refresh displays
        this.refresh().catch(error => {
            this.#debug(`Error refreshing displays during enable: ${error.message}`);
        });
        
        // Emit enabled event
        this.emit('enabled');
    }
    
    /**
     * Enable display manager in limited mode (reduced functionality)
     */
    enableLimited() {
        this.#debug('Enabling display manager in limited mode');
        this.#limitedMode = true;
        this.#isEnabled = true;
        this.#status = DisplayManager.STATUS.ACTIVE;
        this.set_active(true);
        
        // Apply current settings but skip intensive operations
        
        // Emit enabled event with limited flag
        this.emit('enabled', { limited: true });
    }
    
    /**
     * Disable the display manager
     */
    disable() {
        this.#debug('Disabling display manager');
        this.#isEnabled = false;
        this.#status = DisplayManager.STATUS.DISABLED;
        this.set_active(false);
        
        // Emit disabled event
        this.emit('disabled');
    }
    
    /**
     * Destroy the display manager and clean up resources
     * @returns {Promise<void>}
     */
    async destroy() {
        this.#debug('Destroying display manager');
        
        try {
            // Disable first
            this.disable();
            
            // Abort any pending operations
            this.#abortController.abort();
            
            // Clean up resource bundle if available
            if (this.#resourceBundle) {
                await this.#resourceBundle.destroy();
                this.#resourceBundle = null;
            }
            
            // Clear display data
            this.#monitors = [];
            this.#protectedDisplays.clear();
            this.#displayTypes.clear();
            this.#brightnessLevels.clear();
            this.#contrastLevels.clear();
            
            // Remove direct signal connections (those not managed by SignalManager)
            if (this.#monitorChangedId && this.#monitorManager && !this.#signalManager) {
                this.#monitorManager.disconnect(this.#monitorChangedId);
                this.#monitorChangedId = null;
            }
            
            // Emit destroyed event
            this.emit('destroyed');
            
            // Remove all event listeners
            this.removeAllListeners();
        } catch (error) {
            console.error(`[OLED Care] [DisplayManager] Error during cleanup: ${error.message}`);
        }
    }
    
    /**
     * Refresh display information
     * @returns {Promise<void>}
     */
    async refresh() {
        const timer = metrics.startTimer('display_refresh');

        try {
            // Get both types of monitor objects
            const metaMonitors = this.#monitorManager.get_monitors?.() || [];
            const layoutMonitors = Main.layoutManager.monitors || [];

            // Combine information from both sources
            // Create wrapper objects that contain both meta and layout monitor data
            this.#monitors = layoutMonitors.map((layoutMonitor, index) => {
                const metaMonitor = metaMonitors[index] || null;

                return {
                    index,
                    metaMonitor,
                    layoutMonitor,
                    // Layout monitor provides geometry
                    x: layoutMonitor.x || 0,
                    y: layoutMonitor.y || 0,
                    width: layoutMonitor.width || 0,
                    height: layoutMonitor.height || 0,
                    geometry_scale: layoutMonitor.geometry_scale || 1,
                    // Meta monitor provides detailed info (may not exist)
                    get_display_name: () => metaMonitor?.get_display_name?.() || `Monitor ${index}`,
                    get_connector: () => metaMonitor?.connector || null,
                    get_manufacturer: () => metaMonitor?.get_manufacturer?.() || null,
                    get_model: () => metaMonitor?.get_model?.() || null
                };
            });

            this.#primaryMonitor = this.#monitors.find(m => m.index === 0) || null;

            this.#debug(`Refreshed monitors: ${this.#monitors.length} found`);

            // Detect display types
            for (const monitor of this.#monitors) {
                const monitorId = this.#getMonitorId(monitor);
                const displayType = this.#detectDisplayType(monitor);

                this.#debug(`Monitor ${monitorId}: type=${displayType}`);
            }

            // Apply protection to enabled displays
            if (this.#isEnabled) {
                this.#applyDisplaySettings();
            }

            // Emit refresh event
            this.emit('refreshed', this.#monitors);
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error refreshing displays: ${error.message}`);
            
            // Emit error event
            this.emit('error', new DisplayError(
                'Failed to refresh displays',
                { cause: error, context: 'refresh', level: ExtensionError.ERROR_LEVELS.WARNING }
            ));
        }
    }
    
    /**
     * Get all detected displays
     * @returns {Array} List of monitor objects
     */
    getDisplays() {
        return [...this.#monitors];
    }
    
    /**
     * Get currently enabled (protected) displays
     * @returns {Array} List of protected monitor objects
     */
    getEnabledDisplays() {
        return this.#monitors.filter(monitor => 
            this.#protectedDisplays.has(this.#getMonitorId(monitor))
        );
    }
    
    /**
     * Get display information for all monitors
     * @returns {Array} List of display info objects
     */
    getDisplayInfo() {
        return this.#monitors.map(monitor => {
            const monitorId = this.#getMonitorId(monitor);
            return {
                id: monitorId,
                index: monitor.index,
                name: monitor.get_display_name?.() || `Monitor ${monitor.index}`,
                manufacturer: monitor.get_manufacturer?.() || 'Unknown',
                model: monitor.get_model?.() || 'Unknown',
                connector: monitor.get_connector?.() || 'Unknown',
                // Geometry from layout monitor
                x: monitor.x || 0,
                y: monitor.y || 0,
                width: monitor.width || 0,
                height: monitor.height || 0,
                isPrimary: this.#primaryMonitor === monitor,
                isProtected: this.#protectedDisplays.has(monitorId),
                displayType: this.#displayTypes.get(monitorId) || DisplayManager.DISPLAY_TYPES.UNKNOWN,
                currentBrightness: this.#brightnessLevels.get(monitorId) || this.#brightnessLevels.get('default'),
                currentContrast: this.#contrastLevels.get(monitorId) || this.#contrastLevels.get('default')
            };
        });
    }
    
    /**
     * Toggle protection for a specific monitor
     * @param {object} monitor - Monitor object
     * @returns {boolean} New protection state
     */
    toggleProtection(monitor) {
        const monitorId = this.#getMonitorId(monitor);
        const currentState = this.#protectedDisplays.has(monitorId);
        
        this.#debug(`Toggling protection for monitor ${monitorId}: ${currentState} → ${!currentState}`);
        
        if (currentState) {
            this.#protectedDisplays.delete(monitorId);
        } else {
            this.#protectedDisplays.set(monitorId, true);
        }
        
        // Save changes to settings
        this.#saveEnabledDisplays();
        
        // Apply settings if enabling protection
        if (!currentState && this.#isEnabled) {
            this.#applyMonitorSettings(monitor, {
                brightness: this.#brightnessLevels.get('default'),
                contrast: this.#contrastLevels.get('default')
            });
        }
        
        // Emit protection changed event
        this.emit('protection-changed', monitor, !currentState);
        
        return !currentState;
    }
    
    /**
     * Save enabled displays to settings
     * @private
     */
    #saveEnabledDisplays() {
        if (!this.#settings) return;
        
        try {
            const enabledDisplays = [...this.#protectedDisplays.keys()];
            this.#settings.set_strv(DisplayManager.SETTINGS.ENABLED_DISPLAYS, enabledDisplays);
            this.#debug(`Saved ${enabledDisplays.length} protected displays`);
        } catch (error) {
            this.#debug(`Error saving enabled displays: ${error.message}`);
        }
    }
    
    /**
     * Check if a display is currently protected
     * @param {object} monitor - Monitor object
     * @returns {boolean} Protection state
     */
    isProtected(monitor) {
        const monitorId = this.#getMonitorId(monitor);
        return this.#protectedDisplays.has(monitorId);
    }
    
    /**
     * Check if a display is likely an OLED type
     * @param {object} monitor - Monitor object
     * @returns {boolean} Whether the display is likely OLED
     */
    isOledDisplay(monitor) {
        const displayType = this.#detectDisplayType(monitor);
        return displayType === DisplayManager.DISPLAY_TYPES.OLED;
    }
    
    /**
     * Set brightness for a specific display
     * @param {object} monitor - Monitor object
     * @param {number} brightness - Brightness level (0-100)
     */
    setBrightness(monitor, brightness) {
        try {
            const monitorId = this.#getMonitorId(monitor);
            
            // Validate brightness
            const validBrightness = Math.max(0, Math.min(100, brightness));
            
            // Store the brightness for this monitor
            this.#brightnessLevels.set(monitorId, validBrightness);
            
            // Apply the setting if protected
            if (this.#protectedDisplays.has(monitorId) && this.#isEnabled) {
                this.#applyMonitorSettings(monitor, {
                    brightness: validBrightness,
                    contrast: this.#contrastLevels.get(monitorId) || this.#contrastLevels.get('default')
                });
            }
            
            this.#debug(`Set brightness for monitor ${monitorId}: ${validBrightness}`);
            
            // Emit brightness changed event
            this.emit('monitor-brightness-changed', monitor, validBrightness);
        } catch (error) {
            this.#debug(`Error setting brightness: ${error.message}`);
        }
    }
    
    /**
     * Set contrast for a specific display
     * @param {object} monitor - Monitor object
     * @param {number} contrast - Contrast level (0-100)
     */
    setContrast(monitor, contrast) {
        try {
            const monitorId = this.#getMonitorId(monitor);
            
            // Validate contrast
            const validContrast = Math.max(0, Math.min(100, contrast));
            
            // Store the contrast for this monitor
            this.#contrastLevels.set(monitorId, validContrast);
            
            // Apply the setting if protected
            if (this.#protectedDisplays.has(monitorId) && this.#isEnabled) {
                this.#applyMonitorSettings(monitor, {
                    brightness: this.#brightnessLevels.get(monitorId) || this.#brightnessLevels.get('default'),
                    contrast: validContrast
                });
            }
            
            this.#debug(`Set contrast for monitor ${monitorId}: ${validContrast}`);
            
            // Emit contrast changed event
            this.emit('monitor-contrast-changed', monitor, validContrast);
        } catch (error) {
            this.#debug(`Error setting contrast: ${error.message}`);
        }
    }
}

// Register the GObject class instead of using decorator
DisplayManager = GObject.registerClass({
    Properties: {
        'active': GObject.ParamSpec.boolean(
            'active', 'active', 'Active state',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'version': GObject.ParamSpec.string(
            'version', 'version', 'API version',
            GObject.ParamFlags.READABLE,
            '1.0'
        )
    },
    Signals: {
        'display-changed': { param_types: [GObject.TYPE_OBJECT] },
        'protection-changed': { param_types: [GObject.TYPE_OBJECT, GObject.TYPE_BOOLEAN] },
    },
    GTypeName: 'OledCareDisplayManager'
}, DisplayManager); 