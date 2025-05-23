'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// Import error handling and utilities
import { ExtensionError } from './errors.js';
import { metrics } from './metrics.js';
import ResourceManager from './resourceManager.js';
import SignalManager from './signalManager.js';

// Import extension modules
import DisplayManager from './displayManager.js';
import PixelShift from './pixelShift.js';
import Dimming from './dimming.js';
import PixelRefresh from './pixelRefresh.js';

/**
 * Custom error class for indicator operations
 */
class IndicatorError extends ExtensionError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            context: options.context || 'indicator'
        });
        this.name = 'IndicatorError';
    }

    static operationFailed(operation, cause) {
        return new IndicatorError(`Failed to perform indicator operation: ${operation}`, {
            cause,
            context: 'operation',
            metadata: { operation }
        });
    }
}

// Defined as a frozen object for immutability
const CONSTANTS = Object.freeze({
    SETTINGS: {
        DEBUG_MODE: 'debug-mode',
        ENABLED_DISPLAYS: 'enabled-displays',
        SCREEN_DIM_ENABLED: 'screen-dim-enabled',
        DIMMING_LEVEL: 'dimming-level',
        SCREEN_DIM_TIMEOUT: 'screen-dim-timeout',
        UNFOCUS_DIM_ENABLED: 'unfocus-dim-enabled',
        UNFOCUS_DIM_LEVEL: 'unfocus-dim-level',
        PIXEL_SHIFT_ENABLED: 'pixel-shift-enabled',
        PIXEL_SHIFT_INTERVAL: 'pixel-shift-interval',
        PIXEL_REFRESH_ENABLED: 'pixel-refresh-enabled',
        PIXEL_REFRESH_SPEED: 'pixel-refresh-speed',
        PIXEL_REFRESH_SMART: 'pixel-refresh-smart',
        PIXEL_REFRESH_SCHEDULE: 'pixel-refresh-schedule',
        PIXEL_REFRESH_RUNNING: 'pixel-refresh-running',
        PIXEL_REFRESH_PROGRESS: 'pixel-refresh-progress',
        PIXEL_REFRESH_TIME_REMAINING: 'pixel-refresh-time-remaining',
        PIXEL_REFRESH_NEXT_RUN: 'pixel-refresh-next-run',
        PIXEL_REFRESH_MANUAL_TRIGGER: 'pixel-refresh-manual-trigger',
        PIXEL_REFRESH_MANUAL_CANCEL: 'pixel-refresh-manual-cancel'
    },
    PERFORMANCE_BUDGET: {
        MENU_OPERATION: 10 // milliseconds
    }
});

/**
 * Panel indicator for OLED Care extension
 */
@GObject.registerClass({
    GTypeName: 'OledCareIndicator'
})
export default class OledCareIndicator extends PanelMenu.Button {
    // Static initialization block for constants
    static {
        this.REQUIRED_SETTINGS = Object.values(CONSTANTS.SETTINGS);
    }

    // Private fields using true private syntax
    #extension;
    #settings;
    #sessionMode;
    #menuItems = {};
    #displayManager;
    #pixelShift;
    #dimming;
    #pixelRefresh;
    #notificationSource;
    #sessionModeChangedId = null;
    #debug;
    #resourceManager;
    #signalManager;
    #settingsConnections = [];
    #abortController = new AbortController();

    /**
     * Constructor for the OledCareIndicator component
     * @param {object} extension - The extension object
     */
    constructor(extension) {
        super(0.0, 'OLED Care Indicator');
        
        try {
            this.#extension = extension;
            this.#settings = extension?.getSettings();
            this.#sessionMode = Main.sessionMode;
            
            // Initialize debug mode based on settings
            const debugMode = this.#settings?.get_boolean(CONSTANTS.SETTINGS.DEBUG_MODE) ?? false;
            this.#debug = debugMode ? this.#logDebug.bind(this) : () => {};
            
            // Start tracking performance
            metrics.setEnabled(debugMode);
            
            // Set up resource and signal managers
            this.#resourceManager = new ResourceManager(this.#debug);
            this.#signalManager = new SignalManager(this.#debug);
            
            // Validate required settings
            this.#validateSettings();
            
            // Initialize component managers with dependency injection
            this.#initializeComponents();
            
            // Create notification source for system notifications
            this.#createNotificationSource();
            
            // Create panel UI
            this.#createPanelIcon();
            
            // Build menu and bind settings
            try {
                this.#buildMenu();
                this.#bindSettings();
            } catch (error) {
                this.#debug(`Error building menu: ${error.message}`);
                this.#showNotification('Error', 'Failed to build extension menu');
                throw IndicatorError.operationFailed('build_menu', error);
            }
            
            // Initialize features
            this.#debug('Initializing features...');
            this.#initializeFeatures();
            
            // Connect to session mode changes
            this.#connectSessionModeSignal();
            
            // Show welcome notification only in user mode
            if (this.#sessionMode.currentMode === 'user') {
                this.#showNotification('OLED Care Active', 'Protecting your OLED display');
            }
            
            this.#debug('Indicator initialization complete');
        } catch (error) {
            console.error(`[OLED Care] [Indicator] Construction error: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Log a debug message with component prefix
     * @param {string} message - Message to log
     * @private
     */
    #logDebug(message) {
        console.log(`[OLED Care] [Indicator] ${message}`);
        
        // Track debug message in metrics
        metrics.incrementCounter('debug_messages', 1, { component: 'Indicator' });
    }
    
    /**
     * Validate required settings
     * @private
     * @throws {IndicatorError} If settings validation fails
     */
    #validateSettings() {
        try {
            if (!this.#settings) {
                throw new IndicatorError('Settings object is null or undefined', {
                    context: 'validation'
                });
            }
            
            const schemas = this.#settings.list_keys();
            
            // Check for required settings
            for (const setting of OledCareIndicator.REQUIRED_SETTINGS) {
                if (!schemas.includes(setting)) {
                    this.#debug(`Warning: Required setting '${setting}' not found in schema`);
                }
            }
        } catch (error) {
            // Re-throw errors with proper context
            if (!(error instanceof IndicatorError)) {
                throw new IndicatorError(`Settings validation failed: ${error.message}`, { 
                    cause: error,
                    context: 'validation'
                });
            }
            throw error;
        }
    }
    
    /**
     * Initialize component managers
     * @private
     */
    #initializeComponents() {
        const timer = metrics.startTimer('init_components');
        
        try {
            this.#displayManager = new DisplayManager(this.#settings);
            this.#pixelShift = new PixelShift(this.#settings);
            this.#dimming = new Dimming(this.#settings);
            this.#pixelRefresh = new PixelRefresh(this.#settings);
            
            // Inject dependencies
            this.#displayManager.setResourceManager?.(this.#resourceManager);
            this.#displayManager.setSignalManager?.(this.#signalManager);
            this.#pixelShift.setResourceManager?.(this.#resourceManager);
            this.#pixelShift.setSignalManager?.(this.#signalManager);
            this.#dimming.setResourceManager?.(this.#resourceManager);
            this.#dimming.setSignalManager?.(this.#signalManager);
            this.#pixelRefresh.setResourceManager?.(this.#resourceManager);
            this.#pixelRefresh.setSignalManager?.(this.#signalManager);
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error initializing components: ${error.message}`);
            throw IndicatorError.operationFailed('init_components', error);
        }
    }
    
    /**
     * Create notification source for system notifications
     * @private
     */
    #createNotificationSource() {
        try {
            this.#notificationSource = new MessageTray.Source({
                title: 'OLED Care',
                iconName: 'oled-care-symbolic'
            });
            Main.messageTray.add(this.#notificationSource);
        } catch (error) {
            this.#debug(`Error creating notification source: ${error.message}`);
            // Non-critical error, can continue without notifications
        }
    }
    
    /**
     * Create the panel icon
     * @private
     */
    #createPanelIcon() {
        try {
            const icon = new St.Icon({
                icon_name: 'oled-care-symbolic',
                style_class: 'system-status-icon'
            });
            this.add_child(icon);
        } catch (error) {
            this.#debug(`Error creating panel icon: ${error.message}`);
            throw IndicatorError.operationFailed('create_panel_icon', error);
        }
    }
    
    /**
     * Initialize all feature components
     * @private
     */
    #initializeFeatures() {
        const timer = metrics.startTimer('init_features');
        
        try {
            this.#displayManager.init();
            this.#pixelShift.init();
            this.#dimming.init();
            this.#pixelRefresh.init();
            
            this.#debug('Features initialized');
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error initializing features: ${error.message}`);
            this.#showNotification('Error', 'Failed to initialize some features');
            
            throw IndicatorError.operationFailed('init_features', error);
        }
    }
    
    /**
     * Connect to session mode changes
     * @private
     */
    #connectSessionModeSignal() {
        try {
            if (this.#sessionMode) {
                this.#sessionModeChangedId = this.#signalManager.connect(
                    this.#sessionMode,
                    'updated',
                    this.#onSessionModeChanged.bind(this),
                    'session-mode-changed'
                );
            }
        } catch (error) {
            this.#debug(`Error connecting to session mode signal: ${error.message}`);
            // Non-critical error, can continue without session mode handling
        }
    }

    /**
     * Handle session mode changes
     * @private
     */
    #onSessionModeChanged() {
        const timer = metrics.startTimer('session_mode_changed');
        
        try {
            const mode = this.#sessionMode.currentMode;
            this.#debug(`Session mode changed to: ${mode}`);
            
            switch (mode) {
                case 'user':
                    this.#enableFullFunctionality();
                    break;
                case 'unlock-dialog':
                    this.#enableLimitedFunctionality();
                    break;
                default:
                    this.#disableFeatures();
                    break;
            }
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error handling session mode change: ${error.message}`);
        }
    }

    /**
     * Enable full functionality in normal user mode
     * @private
     */
    #enableFullFunctionality() {
        const timer = metrics.startTimer('enable_full_functionality');
        
        try {
            this.#debug('Enabling full functionality');
            this.show();
            this.menu.enable();
            this.#displayManager.enable();
            this.#pixelShift.enable();
            this.#dimming.enable();
            this.#pixelRefresh.enable();
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error enabling full functionality: ${error.message}`);
        }
    }

    /**
     * Enable limited functionality in lock screen mode
     * @private
     */
    #enableLimitedFunctionality() {
        const timer = metrics.startTimer('enable_limited_functionality');
        
        try {
            this.#debug('Enabling limited functionality');
            this.hide();
            this.menu.disable();
            this.#displayManager.enableLimited();
            this.#pixelShift.enable();
            this.#dimming.enableLimited();
            this.#pixelRefresh.disable();
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error enabling limited functionality: ${error.message}`);
        }
    }

    /**
     * Disable all features
     * @private
     */
    #disableFeatures() {
        const timer = metrics.startTimer('disable_features');
        
        try {
            this.#debug('Disabling all features');
            this.hide();
            this.menu.disable();
            this.#displayManager.disable();
            this.#pixelShift.disable();
            this.#dimming.disable();
            this.#pixelRefresh.disable();
            
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error disabling features: ${error.message}`);
        }
    }

    /**
     * Build the indicator menu
     * @private
     */
    #buildMenu() {
        const timer = metrics.startTimer('build_menu');
        
        try {
            this.#debug('Building menu');
            
            // Header
            const headerItem = new PopupMenu.PopupMenuItem('OLED Care', { 
                reactive: false,
                style_class: 'popup-menu-header oled-care-header'
            });
            this.menu.addMenuItem(headerItem);
            
            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            // Display selection
            const displayItem = new PopupMenu.PopupMenuItem('Select Displays');
            displayItem.connect('activate', () => {
                try {
                    this.#displayManager.showDisplaySelector();
                } catch (error) {
                    this.#debug(`Failed to show display selector: ${error.message}`);
                    this.#showNotification('Failed to show display selector', 'error');
                }
            });
            this.menu.addMenuItem(displayItem);
            
            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            // Pixel Shift toggle
            this.#menuItems.pixelShift = new PopupMenu.PopupSwitchMenuItem('Pixel Shift');
            this.#menuItems.pixelShift.setToggleState(
                this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED)
            );
            this.#menuItems.pixelShift.connect('toggled', (item) => {
                this.#settings.set_boolean(CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED, item.state);
            });
            this.menu.addMenuItem(this.#menuItems.pixelShift);
            
            // Screen Dimming toggle
            this.#menuItems.screenDim = new PopupMenu.PopupSwitchMenuItem('Screen Dimming');
            this.#menuItems.screenDim.setToggleState(
                this.#settings.get_boolean(CONSTANTS.SETTINGS.SCREEN_DIM_ENABLED)
            );
            this.#menuItems.screenDim.connect('toggled', (item) => {
                this.#settings.set_boolean(CONSTANTS.SETTINGS.SCREEN_DIM_ENABLED, item.state);
            });
            this.menu.addMenuItem(this.#menuItems.screenDim);
            
            // Window Dimming toggle
            this.#menuItems.windowDim = new PopupMenu.PopupSwitchMenuItem('Window Dimming');
            this.#menuItems.windowDim.setToggleState(
                this.#settings.get_boolean(CONSTANTS.SETTINGS.UNFOCUS_DIM_ENABLED)
            );
            this.#menuItems.windowDim.connect('toggled', (item) => {
                this.#settings.set_boolean(CONSTANTS.SETTINGS.UNFOCUS_DIM_ENABLED, item.state);
            });
            this.menu.addMenuItem(this.#menuItems.windowDim);
            
            // Pixel Refresh toggle
            this.#menuItems.pixelRefresh = new PopupMenu.PopupSwitchMenuItem('Pixel Refresh');
            this.#menuItems.pixelRefresh.setToggleState(
                this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED)
            );
            this.#menuItems.pixelRefresh.connect('toggled', (item) => {
                this.#settings.set_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED, item.state);
            });
            this.menu.addMenuItem(this.#menuItems.pixelRefresh);
            
            // Manual Pixel Refresh
            this.#menuItems.manualRefresh = new PopupMenu.PopupMenuItem('Run Pixel Refresh Now');
            this.#menuItems.manualRefresh.setSensitive(
                !this.#settings.get_boolean(CONSTANTS.SETTINGS.PIXEL_REFRESH_RUNNING)
            );
            this.#menuItems.manualRefresh.connect('activate', () => {
                this.#pixelRefresh.runManualRefresh();
            });
            this.menu.addMenuItem(this.#menuItems.manualRefresh);
            
            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            
            // Settings button
            const settingsItem = new PopupMenu.PopupMenuItem('Settings');
            settingsItem.connect('activate', () => {
                try {
                    // Using the extension's openPrefs method
                    this.#extension.openPreferences();
                } catch (error) {
                    this.#debug(`Error opening preferences: ${error.message}`);
                }
            });
            this.menu.addMenuItem(settingsItem);
            
            this.#debug('Menu built');
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error building menu: ${error.message}`);
            throw IndicatorError.operationFailed('build_menu', error);
        }
    }
    
    /**
     * Bind settings to update UI and components
     * @private
     */
    #bindSettings() {
        const timer = metrics.startTimer('bind_settings');
        
        try {
            this.#debug('Binding settings');
            
            // Bind pixel shift settings
            this.#connectSetting(
                CONSTANTS.SETTINGS.PIXEL_SHIFT_ENABLED,
                (value) => {
                    if (this.#menuItems.pixelShift) {
                        this.#menuItems.pixelShift.setToggleState(value);
                    }
                }
            );
            
            // Bind dimming settings
            this.#connectSetting(
                CONSTANTS.SETTINGS.SCREEN_DIM_ENABLED,
                (value) => {
                    if (this.#menuItems.screenDim) {
                        this.#menuItems.screenDim.setToggleState(value);
                    }
                }
            );
            
            this.#connectSetting(
                CONSTANTS.SETTINGS.UNFOCUS_DIM_ENABLED,
                (value) => {
                    if (this.#menuItems.windowDim) {
                        this.#menuItems.windowDim.setToggleState(value);
                    }
                }
            );
            
            // Bind pixel refresh settings
            this.#connectSetting(
                CONSTANTS.SETTINGS.PIXEL_REFRESH_ENABLED,
                (value) => {
                    if (this.#menuItems.pixelRefresh) {
                        this.#menuItems.pixelRefresh.setToggleState(value);
                    }
                }
            );
            
            // Update manual refresh item sensitivity based on pixel refresh running state
            this.#connectSetting(
                CONSTANTS.SETTINGS.PIXEL_REFRESH_RUNNING,
                (value) => {
                    if (this.#menuItems.manualRefresh) {
                        this.#menuItems.manualRefresh.setSensitive(!value);
                    }
                }
            );
            
            // Bind component properties directly using GSettings bind
            this.#bindComponentProperties();
            
            this.#debug('Settings bound');
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error binding settings: ${error.message}`);
            throw IndicatorError.operationFailed('bind_settings', error);
        }
    }
    
    /**
     * Connect a setting to a callback using SignalManager
     * @param {string} settingKey - The setting key to monitor
     * @param {function} callback - Function to call when setting changes
     * @private
     */
    #connectSetting(settingKey, callback) {
        if (!this.#signalManager || !this.#settings) return;
        
        const id = this.#signalManager.connect(
            this.#settings,
            `changed::${settingKey}`,
            () => {
                const value = this.#getSettingValue(settingKey);
                callback(value);
            },
            `setting-${settingKey}`
        );
        
        this.#settingsConnections.push(id);
    }
    
    /**
     * Get the value of a setting based on its type
     * @param {string} settingKey - The setting key
     * @returns {any} The setting value
     * @private
     */
    #getSettingValue(settingKey) {
        if (!this.#settings) return null;
        
        // Determine setting type and get value accordingly
        if (settingKey.includes('enabled')) {
            return this.#settings.get_boolean(settingKey);
        } else if (settingKey.includes('interval') || 
                  settingKey.includes('level') || 
                  settingKey.includes('timeout') ||
                  settingKey.includes('speed') ||
                  settingKey.includes('progress') ||
                  settingKey.includes('remaining')) {
            return this.#settings.get_int(settingKey);
        } else if (settingKey.includes('schedule')) {
            return this.#settings.get_strv(settingKey);
        } else {
            // Default to boolean for unknown types
            return this.#settings.get_boolean(settingKey);
        }
    }
    
    /**
     * Bind component properties directly using GSettings
     * @private
     */
    #bindComponentProperties() {
        // Direct property bindings for GObject-based components
        const bindings = [
            // PixelShift bindings
            [CONSTANTS.SETTINGS.PIXEL_SHIFT_INTERVAL, this.#pixelShift, 'interval'],
            
            // Dimming bindings
            [CONSTANTS.SETTINGS.DIMMING_LEVEL, this.#dimming, 'level'],
            [CONSTANTS.SETTINGS.SCREEN_DIM_TIMEOUT, this.#dimming, 'timeout'],
            [CONSTANTS.SETTINGS.UNFOCUS_DIM_LEVEL, this.#dimming, 'unfocusLevel'],
            
            // PixelRefresh bindings
            [CONSTANTS.SETTINGS.PIXEL_REFRESH_SPEED, this.#pixelRefresh, 'speed'],
            [CONSTANTS.SETTINGS.PIXEL_REFRESH_SMART, this.#pixelRefresh, 'smart'],
            [CONSTANTS.SETTINGS.PIXEL_REFRESH_SCHEDULE, this.#pixelRefresh, 'schedule'],
            
            // DisplayManager bindings
            [CONSTANTS.SETTINGS.ENABLED_DISPLAYS, this.#displayManager, 'enabledDisplays']
        ];
        
        // Bind each property if target component has the property
        for (const [settingKey, target, property] of bindings) {
            if (target && Object.hasOwn(target, property)) {
                this.#settings.bind(
                    settingKey, 
                    target, 
                    property, 
                    Gio.SettingsBindFlags.DEFAULT
                );
            }
        }
    }
    
    /**
     * Show a notification to the user
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @private
     */
    #showNotification(title, message) {
        try {
            if (!this.#notificationSource || !Main.messageTray) {
                this.#debug('Warning: Notification system not available');
                return;
            }
            
            const notification = new MessageTray.Notification({
                source: this.#notificationSource,
                title: title,
                body: message,
                isTransient: true
            });
            
            try {
                this.#notificationSource.showNotification(notification);
                this.#debug(`Notification shown: ${title} - ${message}`);
                
                // Track notification in metrics
                metrics.incrementCounter('notifications', 1, { title });
            } catch (showError) {
                this.#debug(`Failed to show notification: ${showError.message}`);
            }
        } catch (error) {
            this.#debug(`Error creating notification: ${error.message}`);
        }
    }

    /**
     * Clean up resources before destruction
     */
    async destroy() {
        const timer = metrics.startTimer('indicator_destroy');
        
        try {
            this.#debug('Destroying indicator');
            
            // Cancel any pending operations
            this.#abortController.abort('Component destruction');
            
            // Disconnect session mode signal
            if (this.#sessionModeChangedId && this.#signalManager) {
                this.#signalManager.disconnect(this.#sessionModeChangedId);
                this.#sessionModeChangedId = null;
            }
            
            // Disconnect all setting signals
            if (this.#signalManager) {
                for (const id of this.#settingsConnections) {
                    this.#signalManager.disconnect(id);
                }
                this.#settingsConnections = [];
            }
            
            // Destroy component managers
            await Promise.allSettled([
                this.#displayManager?.destroy(),
                this.#pixelShift?.destroy(),
                this.#dimming?.destroy(),
                this.#pixelRefresh?.destroy()
            ]);
            
            // Clean up notification source
            if (this.#notificationSource) {
                this.#notificationSource.destroy();
                this.#notificationSource = null;
            }
            
            // Clean up resource manager
            if (this.#resourceManager) {
                await this.#resourceManager.cleanupAll();
            }
            
            // Clean up signal manager
            if (this.#signalManager) {
                await this.#signalManager.disconnectAll();
            }
            
            // Call parent destroy
            super.destroy();
            
            this.#debug('Indicator destroyed');
            timer.stop();
        } catch (error) {
            timer.addLabels({ error: true });
            timer.stop();
            
            this.#debug(`Error destroying indicator: ${error.message}`);
        }
    }
} 