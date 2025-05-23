'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Import error handling and utilities
import { ExtensionError } from './errors.js';
import { metrics } from './metrics.js';
import EventEmitter from './eventEmitter.js';

/**
 * Custom error class for pixel refresh operations
 */
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
    
    static validationFailed(key, value, cause) {
        return new PixelRefreshError(`Pixel refresh setting validation failed: ${key}`, {
            cause,
            context: 'validation',
            metadata: { key, value }
        });
    }
}

// Defined as a frozen object for immutability
const CONSTANTS = Object.freeze({
    SETTINGS: {
        DEBUG_MODE: 'debug-mode',
        PIXEL_REFRESH_ENABLED: 'pixel-refresh-enabled',
        PIXEL_REFRESH_SPEED: 'pixel-refresh-speed',
        PIXEL_REFRESH_SMART: 'pixel-refresh-smart',
        PIXEL_REFRESH_SCHEDULE: 'pixel-refresh-schedule',
        PIXEL_REFRESH_INTERVAL: 'pixel-refresh-interval',
        PIXEL_REFRESH_RUNNING: 'pixel-refresh-running',
        PIXEL_REFRESH_PROGRESS: 'pixel-refresh-progress',
        PIXEL_REFRESH_TIME_REMAINING: 'pixel-refresh-time-remaining',
        PIXEL_REFRESH_NEXT_RUN: 'pixel-refresh-next-run',
        PIXEL_REFRESH_MANUAL_TRIGGER: 'pixel-refresh-manual-trigger',
        PIXEL_REFRESH_MANUAL_CANCEL: 'pixel-refresh-manual-cancel',
        PIXEL_REFRESH_INTERRUPTED: 'pixel-refresh-interrupted',
        PIXEL_REFRESH_INTERRUPTED_PROGRESS: 'pixel-refresh-interrupted-progress'
    },
    DEFAULTS: {
        REFRESH_INTERVAL: 240, // minutes
        REFRESH_SPEED: 2 // 1-5 scale
    },
    PERFORMANCE_BUDGET: {
        REFRESH_OPERATION: 16 // milliseconds (target 60fps)
    },
    STATUS: {
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        ERROR: 'error',
        DISABLED: 'disabled'
    }
});

/**
 * Manages pixel refresh operations for OLED displays
 * Provides a full-screen refresh operation to help prevent burn-in
 */
@GObject.registerClass({
    Properties: {
        'running': GObject.ParamSpec.boolean(
            'running', 'running', 'Whether refresh is running',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'progress': GObject.ParamSpec.double(
            'progress', 'progress', 'Refresh progress (0-1)',
            GObject.ParamFlags.READWRITE,
            0, 1, 0
        ),
        'enabled': GObject.ParamSpec.boolean(
            'enabled', 'enabled', 'Whether pixel refresh is enabled',
            GObject.ParamFlags.READWRITE,
            false
        )
    },
    Signals: {
        'refresh-started': {},
        'refresh-progress': { param_types: [GObject.TYPE_DOUBLE] },
        'refresh-completed': {},
        'refresh-canceled': {},
        'refresh-error': { param_types: [GObject.TYPE_STRING] }
    },
    GTypeName: 'OledCarePixelRefresh'
})
export default class PixelRefresh extends EventEmitter {
    // Static initialization block for constants
    static {
        this.REQUIRED_SETTINGS = Object.values(CONSTANTS.SETTINGS);
        this.STATUS = CONSTANTS.STATUS;
    }

    // Private fields using true private syntax
    #settings;
    #refreshTimeout = null;
    #refreshLines = new Map();
    #scheduler = null;
    #schedulerTimeout = null;
    #usePortalAPI = false;
    #cancelRequested = false;
    #lastFrameTime = 0;
    #frameCount = 0;
    #performanceMonitoringActive = false;
    #suspendSignalId = null;
    #resumeSignalId = null;
    #debug;
    #resourceManager = null;
    #signalManager = null;
    #settingsConnections = [];
    #abortController = new AbortController();
    #resourceBundle = null;
    #displayManager = null;
    #status = CONSTANTS.STATUS.IDLE;
    #progress = 0;
    #refreshActor = null;
    #isEnabled = false;
    #refreshStartTime = 0;
    #refreshDuration = 0;
    #nextScheduledRun = null;
    #timeoutIds = new Set();

    /**
     * Constructor for the PixelRefresh component
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
            
            this.#debug('PixelRefresh component constructed');
            
            // Start tracking performance
            metrics.setEnabled(debugMode);
        } catch (error) {
            console.error(`[OLED Care] [PixelRefresh] Construction error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Log a debug message with component prefix
     * @param {string} message - Message to log
     * @private
     */
    #logDebug(message) {
        console.log(`[OLED Care] [PixelRefresh] ${message}`);
        
        // Track debug message in metrics
        metrics.incrementCounter('debug_messages', 1, { component: 'PixelRefresh' });
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
     * @throws {PixelRefreshError} If settings validation fails
     */
    #validateSettings() {
        try {
            if (!this.#settings) {
                throw new PixelRefreshError('Settings object is null or undefined', {
                    context: 'validation'
                });
            }
            
            const schemas = this.#settings.list_keys();
            
            // Check for required settings
            for (const setting of PixelRefresh.REQUIRED_SETTINGS) {
                if (!schemas.includes(setting)) {
                    this.#debug(`Warning: Required setting '${setting}' not found in schema`);
                }
            }

            // Validate interval range
            const interval = this.#settings.get_int(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERVAL);
            if (interval < 60 || interval > 1440) {
                this.#debug(`Warning: Invalid refresh interval ${interval}, resetting to ${CONSTANTS.DEFAULTS.REFRESH_INTERVAL} minutes`);
                this.#settings.set_int(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERVAL, CONSTANTS.DEFAULTS.REFRESH_INTERVAL);
            }

            // Validate speed range
            const speed = this.#settings.get_int(CONSTANTS.SETTINGS.PIXEL_REFRESH_SPEED);
            if (speed < 1 || speed > 5) {
                this.#debug(`Warning: Invalid refresh speed ${speed}, resetting to ${CONSTANTS.DEFAULTS.REFRESH_SPEED}`);
                this.#settings.set_int(CONSTANTS.SETTINGS.PIXEL_REFRESH_SPEED, CONSTANTS.DEFAULTS.REFRESH_SPEED);
            }

            // Validate schedule format
            const schedule = this.#settings.get_strv(CONSTANTS.SETTINGS.PIXEL_REFRESH_SCHEDULE);
            const validSchedule = schedule.filter(timeStr => {
                const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                if (!timeRegex.test(timeStr)) {
                    this.#debug(`Warning: Invalid schedule time format ${timeStr}, will be ignored`);
                    return false;
                }
                return true;
            });
            
            if (validSchedule.length !== schedule.length) {
                this.#settings.set_strv(CONSTANTS.SETTINGS.PIXEL_REFRESH_SCHEDULE, validSchedule);
            }
        } catch (error) {
            // Re-throw errors with proper context
            if (!(error instanceof PixelRefreshError)) {
                throw PixelRefreshError.validationFailed('settings', null, error);
            }
            throw error;
        }
    }

    #log(message) {
        if (this.#settings.get_boolean('debug-mode')) {
            log(`[PixelRefresh] ${message}`);
        }
    }

    #startPerformanceMonitoring() {
        this.#lastFrameTime = GLib.get_monotonic_time();
        this.#frameCount = 0;
        this.#performanceMonitoringActive = true;
        this.#debug('Started performance monitoring');
    }

    #stopPerformanceMonitoring() {
        if (this.#performanceMonitoringActive) {
            const currentTime = GLib.get_monotonic_time();
            const elapsed = currentTime - this.#lastFrameTime;
            if (elapsed > 0) {
                const fps = this.#frameCount / (elapsed / 1000000);
                this.#debug(`Final performance stats: ${fps.toFixed(2)} FPS`);
            }
            this.#performanceMonitoringActive = false;
            this.#frameCount = 0;
            this.#lastFrameTime = 0;
            this.#debug('Stopped performance monitoring');
        }
    }

    #updatePerformanceStats() {
        if (!this.#performanceMonitoringActive) return;

        this.#frameCount++;
        const currentTime = GLib.get_monotonic_time();
        const elapsed = currentTime - this.#lastFrameTime;
        if (elapsed > 1000000) { // 1 second
            const fps = this.#frameCount / (elapsed / 1000000);
            this.#debug(`Performance: ${fps.toFixed(2)} FPS`);
            this.#frameCount = 0;
            this.#lastFrameTime = currentTime;
        }
    }

    /**
     * Initialize the pixel refresh component
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        const timer = metrics.startTimer('pixelrefresh_init');
        
        try {
            this.#debug('Initializing PixelRefresh');
            
            // Connect to settings signals
            await this.#connectSettingsSignals();
            
            // Connect to system signals (like suspend/resume)
            await this.#connectSystemSignals();
            
            // Load schedule from settings
            this.#loadSchedule();
            
            // Update enabled state
            this.#isEnabled = this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED);
            this.set_enabled(this.#isEnabled);
            
            // Check if we need to handle interrupted refresh
            const wasInterrupted = this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED);
            if (wasInterrupted) {
                const progress = this.#settings.get_double(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED_PROGRESS);
                this.#debug(`Detected interrupted refresh at ${progress * 100}% progress`);
                this.emit('refresh-interrupted', progress);
            }
            
            timer.stop();
            this.#debug('PixelRefresh initialization complete');
            
            // Emit ready event
            this.emit('ready');
            
            return true;
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error initializing PixelRefresh: ${error.message}`);
            this.#status = CONSTANTS.STATUS.ERROR;
            
            // Emit error event
            this.emit('error', error instanceof PixelRefreshError ? error : 
                PixelRefreshError.operationFailed('initialization', error));
            
            return false;
        }
    }
    
    /**
     * Connect to settings signals
     * @private
     * @returns {Promise<void>}
     */
    async #connectSettingsSignals() {
        if (!this.#signalManager || !this.#settings) {
            this.#debug('Signal manager or settings not available');
            return;
        }
        
        try {
            // Connect to the enabled setting
            const enabledSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED}`,
                this.#onEnabledChanged.bind(this),
                'refresh-enabled-changed'
            );
            
            // Connect to speed setting
            const speedSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_SPEED}`,
                this.#onSpeedChanged.bind(this),
                'refresh-speed-changed'
            );
            
            // Connect to interval setting
            const intervalSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERVAL}`,
                this.#onIntervalChanged.bind(this),
                'refresh-interval-changed'
            );
            
            // Connect to schedule setting
            const scheduleSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_SCHEDULE}`,
                this.#onScheduleChanged.bind(this),
                'refresh-schedule-changed'
            );
            
            // Connect to manual trigger
            const manualTriggerSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_MANUAL_TRIGGER}`,
                this.#onManualTriggerChanged.bind(this),
                'refresh-manual-trigger'
            );
            
            // Connect to manual cancel
            const manualCancelSignalId = this.#signalManager.connect(
                this.#settings,
                `changed::${CONSTANTS.SETTINGS.PIXEL_REFRESH_MANUAL_CANCEL}`,
                this.#onManualCancelChanged.bind(this),
                'refresh-manual-cancel'
            );
            
            // Store connection IDs for cleanup
            this.#settingsConnections.push(
                enabledSignalId,
                speedSignalId,
                intervalSignalId,
                scheduleSignalId,
                manualTriggerSignalId,
                manualCancelSignalId
            );
            
            this.#debug('Connected to settings signals');
        } catch (error) {
            this.#debug(`Error connecting settings signals: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Connect to system signals (suspend/resume)
     * @private
     * @returns {Promise<void>}
     */
    async #connectSystemSignals() {
        try {
            // Connect to system suspend signal if available
            const systemd = Main.shellDBusService?.systemdProxy;
            
            if (systemd && this.#signalManager) {
                // Connect to prepare for sleep signal (for suspend/resume)
                this.#suspendSignalId = this.#signalManager.connect(
                    systemd,
                    'PrepareForSleep',
                    this.#onPrepareForSleep.bind(this),
                    'system-prepare-for-sleep'
                );
                
                this.#debug('Connected to system suspend/resume signals');
            } else {
                this.#debug('System suspend/resume signals not available');
            }
        } catch (error) {
            this.#debug(`Error connecting to system signals: ${error.message}`);
            // Non-critical error, continue initialization
        }
    }
    
    /**
     * Set the display manager
     * @param {DisplayManager} manager - The display manager instance
     */
    setDisplayManager(manager) {
        this.#displayManager = manager;
        this.#debug('Display manager set');
        return this;
    }
    
    /**
     * Enable pixel refresh functionality
     */
    enable() {
        this.#debug('Enabling pixel refresh');
        
        if (this.#status === CONSTANTS.STATUS.RUNNING) {
            this.#debug('Cannot enable: refresh already running');
            return;
        }
        
        this.#isEnabled = true;
        this.set_enabled(true);
        
        // Update status
        this.#status = CONSTANTS.STATUS.IDLE;
        
        // Clear any interrupted state
        if (this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED)) {
            this.#settings.set_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED, false);
        }
        
        // Start the scheduler if we have a schedule
        this.#startScheduler();
        
        // Emit enabled event
        this.emit('enabled');
    }
    
    /**
     * Disable pixel refresh functionality
     */
    disable() {
        this.#debug('Disabling pixel refresh');
        
        // Save state if we're in the middle of a refresh
        if (this.#status === CONSTANTS.STATUS.RUNNING) {
            this.#settings.set_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED, true);
            this.#settings.set_double(CONSTANTS.SETTINGS.PIXEL_REFRESH_INTERRUPTED_PROGRESS, this.#progress);
            this.#cancelRefresh();
        }
        
        // Stop scheduler
        this.#stopScheduler();
        
        // Update status
        this.#isEnabled = false;
        this.set_enabled(false);
        this.#status = CONSTANTS.STATUS.DISABLED;
        
        // Emit disabled event
        this.emit('disabled');
    }
    
    /**
     * Destroy the pixel refresh component and clean up
     * @returns {Promise<void>}
     */
    async destroy() {
        this.#debug('Destroying pixel refresh');
        
        try {
            // Disable first
            this.disable();
            
            // Abort any pending operations
            this.#abortController.abort();
            
            // Clean up any active timeouts
            for (const timeoutId of this.#timeoutIds) {
                GLib.source_remove(timeoutId);
            }
            this.#timeoutIds.clear();
            
            // Clean up refresh actor if exists
            if (this.#refreshActor) {
                if (this.#refreshActor.get_parent()) {
                    this.#refreshActor.get_parent().remove_child(this.#refreshActor);
                }
                this.#refreshActor.destroy();
                this.#refreshActor = null;
            }
            
            // Clean up resource bundle if available
            if (this.#resourceBundle) {
                await this.#resourceBundle.destroy();
                this.#resourceBundle = null;
            }
            
            // Clear all event listeners
            this.removeAllListeners();
            
            // Remove direct signal connections
            if (this.#suspendSignalId && this.#signalManager) {
                try {
                    const systemd = Main.shellDBusService?.systemdProxy;
                    if (systemd) {
                        systemd.disconnect(this.#suspendSignalId);
                    }
                } catch (error) {
                    this.#debug(`Error disconnecting suspend signal: ${error.message}`);
                }
                this.#suspendSignalId = null;
            }
            
            // Clear references
            this.#displayManager = null;
            this.#settings = null;
            this.#signalManager = null;
            this.#resourceManager = null;
            
            this.#debug('Pixel refresh destroyed');
            
            // Emit destroyed event
            this.emit('destroyed');
        } catch (error) {
            console.error(`[OLED Care] [PixelRefresh] Error during cleanup: ${error.message}`);
        }
    }

    #checkPortalSupport() {
        try {
            const proxy = Main.shellDBusService.shellProxy;
            return proxy !== null;
        } catch (e) {
            this.#debug('Portal API not available: ' + e.message);
            return false;
        }
    }

    #loadSchedule() {
        // Implementation of #loadSchedule method
    }

    #startScheduler() {
        // Implementation of #startScheduler method
    }

    #stopScheduler() {
        // Implementation of #stopScheduler method
    }

    #onEnabledChanged() {
        // Implementation of #onEnabledChanged method
    }

    #onSpeedChanged() {
        // Implementation of #onSpeedChanged method
    }

    #onIntervalChanged() {
        // Implementation of #onIntervalChanged method
    }

    #onScheduleChanged() {
        // Implementation of #onScheduleChanged method
    }

    #onManualTriggerChanged() {
        // Implementation of #onManualTriggerChanged method
    }

    #onManualCancelChanged() {
        // Implementation of #onManualCancelChanged method
    }

    #onPrepareForSleep() {
        // Implementation of #onPrepareForSleep method
    }

    #cancelRefresh() {
        // Implementation of #cancelRefresh method
    }

    #startRefresh() {
        // Implementation of #startRefresh method
    }

    #rescheduleRefresh() {
        // Implementation of #rescheduleRefresh method
    }

    #scheduleNextRefresh() {
        // Implementation of #scheduleNextRefresh method
    }

    #shouldRunRefresh() {
        // Implementation of #shouldRunRefresh method
    }

    #checkCriticalApps() {
        // Implementation of #checkCriticalApps method
    }

    #runManualRefresh() {
        // Implementation of #runManualRefresh method
    }
} 