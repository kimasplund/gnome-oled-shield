'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Import modules conditionally based on environment
const isTestEnv = GLib.getenv('G_TEST_SRCDIR') !== null;

const Main = isTestEnv 
    ? (await import('./tests/unit/mocks/main.js')).default 
    : (await import('resource:///org/gnome/shell/ui/main.js'));

import { Extension as BaseExtension } from 'resource:///org/gnome/shell/extensions/extension.js';

// Import compatibility layer first to register polyfills (AbortController, etc.)
import './lib/compatibility.js';

// Import feature modules
import Dimming from './lib/dimming.js';
import DisplayManager from './lib/displayManager.js';
import PixelShift from './lib/pixelShift.js';
import PixelRefresh from './lib/pixelRefresh.js';
import Indicator from './lib/indicator.js';

// Import utility modules
import SignalManager from './lib/signalManager.js';
import ResourceManager from './lib/resourceManager.js';
import { metrics, measure, timed } from './lib/metrics.js';
import { 
    ExtensionError, 
    ComponentInitError, 
    SettingsError, 
    DisplayError,
    errorRegistry
} from './lib/errors.js';

/**
 * Main extension class for OLED Care
 */
export default class OledCareExtension extends BaseExtension {
    // Static initialization block for constants and configuration
    static {
        this.EXTENSION_ID = 'oled-care@asplund.kim';
        this.EXTENSION_NAME = 'OLED Care';
        this.DEBUG_MODE_KEY = 'debug-mode';
        this.SCREEN_DIM_ENABLED_KEY = 'screen-dim-enabled';
        this.PIXEL_SHIFT_ENABLED_KEY = 'pixel-shift-enabled';
        this.PIXEL_REFRESH_ENABLED_KEY = 'pixel-refresh-enabled';
        
        // Component initialization timeout in milliseconds
        this.INIT_TIMEOUT = 5000;
        
        // Define component configuration for easier management
        // NOTE: Components are stored in #components Map keyed by their COMPONENTS key
        // (e.g., 'DIMMING', 'DISPLAY_MANAGER') and synced to private fields after init.
        this.COMPONENTS = Object.freeze({
            DIMMING: {
                name: 'Dimming',
                class: Dimming,
                dependencies: [],
                settingsKey: 'screen-dim-enabled'
            },
            DISPLAY_MANAGER: {
                name: 'DisplayManager',
                class: DisplayManager,
                dependencies: []
            },
            PIXEL_SHIFT: {
                name: 'PixelShift',
                class: PixelShift,
                dependencies: [],
                settingsKey: 'pixel-shift-enabled'
            },
            PIXEL_REFRESH: {
                name: 'PixelRefresh',
                class: PixelRefresh,
                dependencies: ['DISPLAY_MANAGER'],
                settingsKey: 'pixel-refresh-enabled'
            }
        });
        
        // Status codes for initialization
        this.STATUS = Object.freeze({
            INITIALIZING: 'initializing',
            READY: 'ready',
            ERROR: 'error',
            DISABLED: 'disabled'
        });
    }
    
    // Private field declarations (initializers moved to constructor for GObject compatibility)
    #dimming;
    #displayManager;
    #pixelShift;
    #pixelRefresh;
    #settings;
    #indicator;
    #signalManager;
    #resourceManager;
    #componentsReady;
    #hasErrors;
    #status;
    #abortController;
    #debugMode;
    #components;
    #initPromises;
    #metricsCallbackId;
    #errorListenerId;
    #resourceBundle;
    #bgSettings;
    #panelHidden;
    #dashHidden;
    #savedPanelHeight;
    #panelBarrier;
    #panelPressure;
    #panelHideTimeoutId;
    #panelShowTimeoutId;
    #unfocusDimEnabled;
    #unfocusDimEffects;
    #focusWindowId;

    /**
     * Constructor for the extension
     * @param {object} metadata - Extension metadata
     */
    constructor(metadata) {
        super(metadata);

        // Initialize fields in constructor (class field initializers don't run in GObject classes)
        this.#dimming = null;
        this.#displayManager = null;
        this.#pixelShift = null;
        this.#pixelRefresh = null;
        this.#settings = null;
        this.#indicator = null;
        this.#signalManager = null;
        this.#resourceManager = null;
        this.#componentsReady = false;
        this.#hasErrors = false;
        this.#status = OledCareExtension.STATUS.INITIALIZING;
        this.#abortController = new AbortController();
        this.#debugMode = false;
        this.#components = new Map();
        this.#initPromises = new Map();
        this.#metricsCallbackId = null;
        this.#errorListenerId = null;
        this.#resourceBundle = null;
        this.#bgSettings = null;
        this.#panelHidden = false;
        this.#dashHidden = false;
        this.#savedPanelHeight = -1;
        this.#panelBarrier = null;
        this.#panelPressure = null;
        this.#panelHideTimeoutId = null;
        this.#panelShowTimeoutId = null;
        this.#unfocusDimEnabled = false;
        this.#unfocusDimEffects = new Map();
        this.#focusWindowId = null;

        // Initialize error handling
        this.#initializeErrorReporting();
    }
    
    /**
     * Initialize error reporting system
     * @private
     */
    #initializeErrorReporting() {
        // Set up error listener
        this.#errorListenerId = errorRegistry.addErrorListener(error => {
            // Log critical errors
            if (error.level === ExtensionError.ERROR_LEVELS.CRITICAL) {
                this.#logError(`Critical error in ${error.context || 'unknown'}`, error);
            }
            
            // Update indicator if we have one
            if (this.#indicator && typeof this.#indicator.updateErrorStatus === 'function') {
                this.#indicator.updateErrorStatus(errorRegistry.getStatistics());
            }
        });
    }

    /**
     * Enable the extension
     */
    enable() {
        // Start a performance timer for the enable operation
        const enableTimer = metrics.startTimer('extension_enable');
        
        try {
            // Initialize settings
            this.#settings = this.getSettings();

            // Set up debug mode for metrics
            this.#debugMode = this.#settings?.get_boolean(OledCareExtension.DEBUG_MODE_KEY) ?? false;
            metrics.setEnabled(this.#debugMode);
            
            // Initialize managers
            this.#signalManager = new SignalManager(this.#log.bind(this));
            this.#resourceManager = new ResourceManager(this.#log.bind(this));
            
            // Create a resource bundle for the extension
            this.#resourceBundle = this.#resourceManager.createBundle();
            
            // Initialize debug mode
            this.#log('Enabling OLED Care extension');
            
            // Start frame rate monitoring if in debug mode
            if (this.#debugMode) {
                metrics.startFrameWatching();
                
                // Add metrics callback
                this.#metricsCallbackId = metrics.addCallback(update => {
                    if (update.type === 'histogram' && update.name === 'frame_time' && 
                        update.value > 100 && this.#indicator) {
                        this.#indicator.notifyPerformanceIssue(update.value);
                    }
                });
            }
            
            // Initialize components asynchronously
            this.#initializeComponentsAsync().then(() => {
                this.#status = OledCareExtension.STATUS.READY;
                this.#componentsReady = true;

                // Sync private fields from the components Map
                this.#dimming = this.#components.get('DIMMING');
                this.#displayManager = this.#components.get('DISPLAY_MANAGER');
                this.#pixelShift = this.#components.get('PIXEL_SHIFT');
                this.#pixelRefresh = this.#components.get('PIXEL_REFRESH');

                // Create and add the panel indicator now that components are ready
                this.#createIndicator();

                if (this.#indicator) {
                    this.#indicator.updateStatus(OledCareExtension.STATUS.READY);
                }

                // Connect to settings changes and apply initial settings
                this.#signalManager.connect(
                    this.#settings,
                    'changed',
                    this.#onSettingsChanged.bind(this),
                    'settings-changed'
                );
                this.#onSettingsChanged();

                // Record the completion of async initialization
                metrics.incrementCounter('initialization_complete');
                enableTimer.addLabels({ status: 'success', phase: 'complete' });
                enableTimer.stop();

                this.#log('OLED Care extension fully initialized');
            }).catch(error => {
                this.#status = OledCareExtension.STATUS.ERROR;
                this.#logError('Async initialization error', error);

                // Still create indicator so user can see error status
                this.#createIndicator();

                if (this.#indicator) {
                    this.#indicator.updateStatus(OledCareExtension.STATUS.ERROR, error);
                }

                enableTimer.addLabels({ status: 'error', phase: 'async_init_failed' });
                enableTimer.stop();
            });
            
            this.#log('OLED Care extension enabled');
        } catch (error) {
            // Stop the timer with error label
            enableTimer.addLabels({ error: true, phase: 'enable_failed' });
            enableTimer.stop();
            
            this.#logError('Error enabling extension', error);
            this.#hasErrors = true;
            this.#status = OledCareExtension.STATUS.ERROR;
            
            // Register the error
            errorRegistry.registerError(error, 'extension_enable');
            
            // Try to clean up anything that was initialized
            this.disable();
        }
    }

    /**
     * Initialize all extension components asynchronously
     * @private
     * @returns {Promise<void>}
     */
    async #initializeComponentsAsync() {
        // Start a timer for initialization
        const initTimer = metrics.startTimer('component_initialization');
        
        try {
            // Get component initialization order based on dependencies
            const componentsInOrder = this.#getComponentInitOrder();
            
            // Create initialization promises for each component
            const initPromises = componentsInOrder.map(compKey => {
                const component = OledCareExtension.COMPONENTS[compKey];
                return this.#initComponent(component).then(instance => {
                    // Store in the components map
                    this.#components.set(compKey, instance);
                    return instance;
                });
            });
            
            // Create a timeout promise using AbortController
            const timeoutController = new AbortController();
            const timeoutPromise = new Promise((_, reject) => {
                const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, OledCareExtension.INIT_TIMEOUT, () => {
                    reject(new ComponentInitError('All Components', {
                        cause: new Error('Component initialization timeout'),
                        context: 'initialization',
                        level: ExtensionError.ERROR_LEVELS.CRITICAL
                    }));
                    return GLib.SOURCE_REMOVE;
                });
                
                // Track the timeout for cleanup
                this.#resourceBundle.track(
                    { id: timeoutId },
                    () => GLib.source_remove(timeoutId),
                    ResourceManager.RESOURCE_TYPES.TIMEOUT,
                    { name: 'init-timeout' }
                );
                
                // Clean up the timeout when abort is triggered
                timeoutController.signal.addEventListener('abort', () => {
                    GLib.source_remove(timeoutId);
                });
            });
            
            // Wait for all components to initialize or timeout
            try {
                // Use Promise.race for whichever completes first
                await Promise.race([
                    Promise.allSettled(initPromises),
                    timeoutPromise
                ]);
                
                // If we get here, cancel the timeout
                timeoutController.abort();
                
                // Check if any component failed to initialize
                const failedComponents = [];
                for (const [compKey, component] of Object.entries(OledCareExtension.COMPONENTS)) {
                    if (!this.#components.get(compKey)) {
                        failedComponents.push(compKey);
                    }
                }
                
                if (failedComponents.length > 0) {
                    throw new ComponentInitError(`Components: ${failedComponents.join(', ')}`, {
                        context: 'initialization',
                        level: ExtensionError.ERROR_LEVELS.ERROR,
                        metadata: { failedComponents }
                    });
                }
                
                // All components initialized successfully
                initTimer.addLabels({ success: true });
                initTimer.stop();
                
                return this.#components;
            } catch (error) {
                // Stop the initialization timer with error label
                initTimer.addLabels({ error: true });
                initTimer.stop();
                
                // Clean up timeout
                timeoutController.abort();
                
                // Register and propagate the error
                errorRegistry.registerError(error, 'component_initialization');
                throw error;
            }
        } catch (error) {
            // If there's an error outside the initialization process
            initTimer.addLabels({ error: true, phase: 'pre_initialization' });
            initTimer.stop();
            
            errorRegistry.registerError(error, 'component_initialization_setup');
            throw error;
        }
    }
    
    /**
     * Initialize a component with its dependencies
     * @param {object} component - Component configuration
     * @returns {Promise<object>} Initialized component instance
     * @private
     */
    async #initComponent(component) {
        // Check if we already have a promise for this component
        if (this.#initPromises.has(component.name)) {
            return this.#initPromises.get(component.name);
        }
        
        // Start a timer for this component's initialization
        const timer = metrics.startTimer('component_init', { component: component.name });
        
        // Create initialization promise
        const initPromise = (async () => {
            try {
                this.#log(`Initializing component: ${component.name}`);
                
                // Wait for dependencies to be initialized first
                let deps = [];
                if (component.dependencies.length > 0) {
                    const depPromises = component.dependencies.map(depKey => {
                        const depComponent = OledCareExtension.COMPONENTS[depKey];
                        return this.#initComponent(depComponent);
                    });

                    deps = await Promise.all(depPromises);
                }
                
                const instance = deps.length > 0 
                    ? new component.class(this.#settings, ...deps)
                    : new component.class(this.#settings);
                
                // Hook up events for the component if it has them
                if (typeof instance.on === 'function') {
                    instance.on('error', error => {
                        errorRegistry.registerError(error, component.name);
                    });
                }
                
                // Check if component should be enabled based on settings
                if (component.settingsKey && this.#settings) {
                    const enabled = this.#settings.get_boolean(component.settingsKey);
                    if (enabled && typeof instance.enable === 'function') {
                        instance.enable();
                    }
                }
                
                // Stop the timer with success label
                timer.addLabels({ success: true });
                timer.stop();
                
                this.#log(`Component initialized successfully: ${component.name}`);
                return instance;
            } catch (error) {
                // Stop the timer with error label
                timer.addLabels({ error: true });
                timer.stop();
                
                // Register the error
                const componentError = error instanceof ComponentInitError 
                    ? error 
                    : new ComponentInitError(component.name, {
                        cause: error,
                        context: 'initialization',
                        level: ExtensionError.ERROR_LEVELS.ERROR
                    });
                
                errorRegistry.registerError(componentError, 'component_initialization');
                this.#logError(`Failed to initialize component: ${component.name}`, error);
                
                // Remove the promise so we can try again if needed
                this.#initPromises.delete(component.name);
                
                throw componentError;
            }
        })();
        
        // Store the promise for future use
        this.#initPromises.set(component.name, initPromise);
        
        return initPromise;
    }
    
    /**
     * Get the initialization order for components based on dependencies
     * @returns {Array<string>} Component keys in initialization order
     * @private
     */
    #getComponentInitOrder() {
        const components = Object.keys(OledCareExtension.COMPONENTS);
        const order = [];
        const visited = new Set();
        const visiting = new Set();
        
        // Topological sort to resolve dependencies
        const visit = (key) => {
            if (visited.has(key)) return;
            if (visiting.has(key)) {
                throw new Error(`Circular dependency detected for component: ${key}`);
            }
            
            visiting.add(key);
            
            const component = OledCareExtension.COMPONENTS[key];
            for (const dep of component.dependencies) {
                visit(dep);
            }
            
            visiting.delete(key);
            visited.add(key);
            order.push(key);
        };
        
        // Visit all components to establish initialization order
        for (const key of components) {
            try {
                visit(key);
            } catch (error) {
                this.#logError(`Error determining component initialization order: ${error.message}`);
                
                // Register the error
                errorRegistry.registerError(error, 'component_init_order');
                
                // Fall back to default order if there's an error
                return components;
            }
        }
        
        return order;
    }
    
    /**
     * Create and add the panel indicator
     * @private
     */
    #createIndicator() {
        try {
            // Create the indicator, passing extension dir for icon loading
            this.#indicator = new Indicator(this.#settings, {
                displayManager: this.#displayManager,
                pixelShift: this.#pixelShift,
                pixelRefresh: this.#pixelRefresh,
                dimming: this.#dimming,
                openPreferences: () => this.openPreferences(),
                extensionDir: this.dir
            });
            
            // Set initial status
            this.#indicator.updateStatus(this.#status);
            
            // Add the indicator to the panel
            Main.panel.addToStatusArea(OledCareExtension.EXTENSION_ID, this.#indicator);
            
            // Note: Indicator extends PanelMenu.Button (not EventEmitter),
            // so event-based communication is handled via GSettings signals instead.
        } catch (error) {
            this.#logError('Error creating indicator', error);
            
            // Register the error
            errorRegistry.registerError(error, 'indicator_creation');
        }
    }
    
    /**
     * Handle settings changes
     * @param {Gio.Settings} [settings] - Settings object
     * @param {string} [key] - Changed setting key
     * @private
     */
    #onSettingsChanged(settings, key) {
        try {
            const timer = metrics.startTimer('settings_changed', { key });
            
            // If specific key changed
            if (key) {
                this.#handleSpecificSetting(key);
            } else {
                // Apply all settings
                this.#applyAllSettings();
            }
            
            // Stop the timer
            timer.stop();
        } catch (error) {
            this.#logError(`Error applying settings change for key: ${key}`, error);
            
            // Register the error
            errorRegistry.registerError(
                new SettingsError(`Failed to apply setting: ${key}`, key, {
                    cause: error,
                    context: 'settings_changed'
                }), 
                'settings_changed'
            );
        }
    }
    
    /**
     * Handle a specific setting change
     * @param {string} key - The setting key that changed
     * @private
     */
    #handleSpecificSetting(key) {
        if (!this.#settings) return;
        
        // Check for debug mode setting
        if (key === OledCareExtension.DEBUG_MODE_KEY) {
            this.#debugMode = this.#settings.get_boolean(key);
            metrics.setEnabled(this.#debugMode);

            if (this.#debugMode) {
                metrics.startFrameWatching();
            } else {
                metrics.stopFrameWatching();
            }

            return;
        }

        // Handle true black background toggle
        if (key === 'true-black-background') {
            const enabled = this.#settings.get_boolean(key);
            if (enabled) {
                this.#enableTrueBlackBackground();
            } else {
                this.#restoreBackground();
            }
            return;
        }

        // Handle autohide top panel toggle
        if (key === 'autohide-top-panel') {
            const enabled = this.#settings.get_boolean(key);
            if (enabled) {
                this.#hideTopPanel();
            } else {
                this.#showTopPanel();
            }
            return;
        }

        // Handle unfocus dim toggle
        if (key === 'unfocus-dim-enabled') {
            const enabled = this.#settings.get_boolean(key);
            if (enabled) {
                this.#enableUnfocusDim();
            } else {
                this.#disableUnfocusDim();
            }
            return;
        }

        // Handle unfocus dim level change
        if (key === 'unfocus-dim-level') {
            if (this.#unfocusDimEnabled) {
                this.#updateUnfocusDimLevel();
            }
            return;
        }

        // Handle autohide dash toggle
        if (key === 'autohide-dash') {
            const enabled = this.#settings.get_boolean(key);
            if (enabled) {
                this.#hideDash();
            } else {
                this.#showDash();
            }
            return;
        }
        
        // Find component for this setting
        for (const [compKey, component] of Object.entries(OledCareExtension.COMPONENTS)) {
            if (component.settingsKey === key) {
                const enabled = this.#settings.get_boolean(key);
                const instance = this.#components.get(compKey);
                
                if (!instance) {
                    this.#log(`Component ${component.name} not available for setting: ${key}`);
                    continue;
                }
                
                if (enabled) {
                    if (typeof instance.enable === 'function') {
                        instance.enable();
                    }
                } else {
                    if (typeof instance.disable === 'function') {
                        instance.disable();
                    }
                }
                
                if (this.#indicator) {
                    this.#indicator.updateComponentStatus(compKey, enabled);
                }
                
                this.#log(`Applied setting ${key}=${enabled} to ${component.name}`);
                break;
            }
        }
    }
    
    /**
     * Apply all settings at once
     * @private
     */
    #applyAllSettings() {
        if (!this.#settings) return;
        
        // Update debug mode
        this.#debugMode = this.#settings.get_boolean(OledCareExtension.DEBUG_MODE_KEY);
        metrics.setEnabled(this.#debugMode);
        
        // Apply settings to each component
        for (const [compKey, component] of Object.entries(OledCareExtension.COMPONENTS)) {
            if (!component.settingsKey) continue;

            const instance = this.#components.get(compKey);
            if (!instance) continue;
            
            const enabled = this.#settings.get_boolean(component.settingsKey);
            
            if (enabled) {
                if (typeof instance.enable === 'function') {
                    instance.enable();
                }
            } else {
                if (typeof instance.disable === 'function') {
                    instance.disable();
                }
            }
            
            if (this.#indicator) {
                this.#indicator.updateComponentStatus(compKey, enabled);
            }
        }
        
        // Apply true black background if enabled
        if (this.#settings.get_boolean('true-black-background')) {
            this.#enableTrueBlackBackground();
        }

        // Apply unfocus dim settings
        if (this.#settings.get_boolean('unfocus-dim-enabled')) {
            this.#enableUnfocusDim();
        } else {
            this.#disableUnfocusDim();
        }

        // Apply autohide settings
        if (this.#settings.get_boolean('autohide-top-panel')) {
            this.#hideTopPanel();
        } else {
            this.#showTopPanel();
        }

        if (this.#settings.get_boolean('autohide-dash')) {
            this.#hideDash();
        } else {
            this.#showDash();
        }

        this.#log('Applied all settings');
    }

    /**
     * Enable true black background by saving current settings and applying solid black
     * @private
     */
    #enableTrueBlackBackground() {
        try {
            if (!this.#bgSettings) {
                this.#bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
            }

            // Save current background settings (only if we haven't already)
            const savedJson = this.#settings.get_string('true-black-saved-background');
            if (!savedJson) {
                const backup = {
                    'picture-uri': this.#bgSettings.get_string('picture-uri'),
                    'picture-uri-dark': this.#bgSettings.get_string('picture-uri-dark'),
                    'picture-options': this.#bgSettings.get_string('picture-options'),
                    'primary-color': this.#bgSettings.get_string('primary-color'),
                    'secondary-color': this.#bgSettings.get_string('secondary-color'),
                    'color-shading-type': this.#bgSettings.get_string('color-shading-type'),
                };
                this.#settings.set_string('true-black-saved-background', JSON.stringify(backup));
                this.#log('Saved background settings backup');
            }

            // Apply true black
            this.#bgSettings.set_string('picture-options', 'none');
            this.#bgSettings.set_string('primary-color', '#000000');
            this.#bgSettings.set_string('secondary-color', '#000000');
            this.#bgSettings.set_string('color-shading-type', 'solid');
            this.#log('Applied true black background');
        } catch (error) {
            this.#logError('Failed to apply true black background', error);
        }
    }

    /**
     * Restore the original background settings
     * @private
     */
    #restoreBackground() {
        try {
            if (!this.#bgSettings) {
                this.#bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
            }

            const savedJson = this.#settings.get_string('true-black-saved-background');
            if (!savedJson) {
                this.#log('No saved background settings to restore');
                return;
            }

            const backup = JSON.parse(savedJson);
            for (const [key, value] of Object.entries(backup)) {
                this.#bgSettings.set_string(key, value);
            }

            // Clear the saved backup
            this.#settings.set_string('true-black-saved-background', '');
            this.#log('Restored background settings');
        } catch (error) {
            this.#logError('Failed to restore background', error);
        }
    }

    /**
     * Enable auto-hide for the top panel.
     * Panel slides out, moving the mouse to the top edge brings it back.
     * @private
     */
    #hideTopPanel() {
        if (this.#panelHidden) return;
        try {
            const panel = Main.panel;
            if (!panel) return;

            // Save original height for restoration
            if (this.#savedPanelHeight < 0) {
                this.#savedPanelHeight = panel.height;
            }

            this.#panelHidden = true;

            // Set up a pressure barrier at the top edge so mouse hover reveals the panel
            this.#setupPanelBarrier();

            // Connect to panel enter/leave for auto-show/hide
            panel.connect('enter-event', () => {
                this.#cancelPanelHideTimeout();
            });
            panel.connect('leave-event', () => {
                this.#schedulePanelHide();
            });

            // Initially hide
            this.#panelSlideOut();
            this.#log('Top panel auto-hide enabled');
        } catch (error) {
            this.#logError('Failed to enable panel auto-hide', error);
        }
    }

    /**
     * Disable auto-hide, permanently show the top panel
     * @private
     */
    #showTopPanel() {
        if (!this.#panelHidden) return;
        try {
            this.#cancelPanelHideTimeout();
            this.#cancelPanelShowTimeout();
            this.#destroyPanelBarrier();

            const panel = Main.panel;
            if (panel) {
                panel.ease({
                    y: 0,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                panel.reactive = true;
            }

            // Restore struts so windows don't overlap the panel
            Main.layoutManager.panelBox.set_height(this.#savedPanelHeight > 0 ? this.#savedPanelHeight : -1);

            this.#panelHidden = false;
            this.#log('Top panel shown');
        } catch (error) {
            this.#logError('Failed to show top panel', error);
        }
    }

    /**
     * Slide the panel off-screen (upward)
     * @private
     */
    #panelSlideOut() {
        const panel = Main.panel;
        if (!panel) return;

        const panelHeight = this.#savedPanelHeight > 0 ? this.#savedPanelHeight : panel.height;

        panel.ease({
            y: -panelHeight,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });

        // Collapse the panel box so windows use the full screen
        Main.layoutManager.panelBox.set_height(0);
    }

    /**
     * Slide the panel back on-screen
     * @private
     */
    #panelSlideIn() {
        const panel = Main.panel;
        if (!panel) return;

        const panelHeight = this.#savedPanelHeight > 0 ? this.#savedPanelHeight : panel.height;
        Main.layoutManager.panelBox.set_height(panelHeight);

        panel.ease({
            y: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    /**
     * Create a pressure barrier at the top screen edge to trigger panel reveal
     * @private
     */
    #setupPanelBarrier() {
        this.#destroyPanelBarrier();

        // Create a Meta.Barrier along the top edge
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;

        this.#panelBarrier = new Meta.Barrier({
            display: global.display,
            x1: monitor.x,
            y1: monitor.y,
            x2: monitor.x + monitor.width,
            y2: monitor.y,
            directions: Meta.BarrierDirection.POSITIVE_Y,
        });

        // Use Shell.PressureBarrier for hot-edge detection
        this.#panelPressure = new Shell.PressureBarrier(
            100,    // threshold (pressure units)
            1000,   // timeout (ms)
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
        );

        this.#panelPressure.addBarrier(this.#panelBarrier);
        this.#panelPressure.connect('trigger', () => {
            this.#cancelPanelShowTimeout();
            this.#panelSlideIn();
            // Auto-hide again after the mouse leaves
            this.#schedulePanelHide();
        });
    }

    /**
     * Clean up the pressure barrier
     * @private
     */
    #destroyPanelBarrier() {
        if (this.#panelPressure) {
            if (this.#panelBarrier) {
                this.#panelPressure.removeBarrier(this.#panelBarrier);
            }
            this.#panelPressure = null;
        }
        if (this.#panelBarrier) {
            this.#panelBarrier.destroy();
            this.#panelBarrier = null;
        }
    }

    /**
     * Schedule the panel to hide after a delay
     * @private
     */
    #schedulePanelHide() {
        this.#cancelPanelHideTimeout();
        if (!this.#panelHidden) return;

        this.#panelHideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this.#panelHideTimeoutId = null;

            // Only hide if cursor isn't on the panel
            const [, pointerY] = global.get_pointer();
            const panelHeight = this.#savedPanelHeight > 0 ? this.#savedPanelHeight : Main.panel.height;
            if (pointerY > panelHeight) {
                this.#panelSlideOut();
            } else {
                // Cursor still on panel, reschedule
                this.#schedulePanelHide();
            }

            return GLib.SOURCE_REMOVE;
        });
    }

    #cancelPanelHideTimeout() {
        if (this.#panelHideTimeoutId !== null) {
            GLib.source_remove(this.#panelHideTimeoutId);
            this.#panelHideTimeoutId = null;
        }
    }

    #cancelPanelShowTimeout() {
        if (this.#panelShowTimeoutId !== null) {
            GLib.source_remove(this.#panelShowTimeoutId);
            this.#panelShowTimeoutId = null;
        }
    }

    /**
     * Hide the dash/dock to reduce OLED wear
     * @private
     */
    #hideDash() {
        if (this.#dashHidden) return;
        try {
            // Hide the overview dash
            const dash = Main.overview?.dash;
            if (dash) {
                dash.hide();
            }

            // Also handle Ubuntu Dock / Dash to Dock if present
            const dockSettings = this.#getDockSettings();
            if (dockSettings) {
                dockSettings.set_boolean('dock-fixed', false);
                dockSettings.set_boolean('autohide', true);
                dockSettings.set_int('intellihide-mode', 0); // ALL_WINDOWS - most aggressive hide
            }

            this.#dashHidden = true;
            this.#log('Dash hidden');
        } catch (error) {
            this.#logError('Failed to hide dash', error);
        }
    }

    /**
     * Show the dash/dock
     * @private
     */
    #showDash() {
        if (!this.#dashHidden) return;
        try {
            const dash = Main.overview?.dash;
            if (dash) {
                dash.show();
            }

            // Restore Ubuntu Dock / Dash to Dock defaults
            const dockSettings = this.#getDockSettings();
            if (dockSettings) {
                dockSettings.reset('dock-fixed');
                dockSettings.reset('autohide');
                dockSettings.reset('intellihide-mode');
            }

            this.#dashHidden = false;
            this.#log('Dash shown');
        } catch (error) {
            this.#logError('Failed to show dash', error);
        }
    }

    /**
     * Get GSettings for Ubuntu Dock / Dash to Dock if available
     * @returns {Gio.Settings|null}
     * @private
     */
    #getDockSettings() {
        try {
            const schemas = Gio.Settings.list_schemas();
            if (schemas.includes('org.gnome.shell.extensions.dash-to-dock')) {
                return new Gio.Settings({ schema: 'org.gnome.shell.extensions.dash-to-dock' });
            }
        } catch {
            // No dock extension installed
        }
        return null;
    }

    /**
     * Enable unfocused window dimming
     * @private
     */
    #enableUnfocusDim() {
        if (this.#unfocusDimEnabled) return;
        try {
            this.#unfocusDimEnabled = true;

            // Connect to focus-window changes
            const display = global.display;
            this.#focusWindowId = display.connect('notify::focus-window', () => {
                this.#onFocusWindowChanged();
            });

            // Apply to current windows
            this.#onFocusWindowChanged();
            this.#log('Unfocus dim enabled');
        } catch (error) {
            this.#logError('Failed to enable unfocus dim', error);
        }
    }

    /**
     * Disable unfocused window dimming and remove all effects
     * @private
     */
    #disableUnfocusDim() {
        if (!this.#unfocusDimEnabled) return;
        try {
            // Disconnect focus signal
            if (this.#focusWindowId !== null) {
                global.display.disconnect(this.#focusWindowId);
                this.#focusWindowId = null;
            }

            // Remove all dimming effects
            for (const [actor, effect] of this.#unfocusDimEffects) {
                try {
                    actor.remove_effect(effect);
                } catch {
                    // Actor may have been destroyed
                }
            }
            this.#unfocusDimEffects.clear();

            this.#unfocusDimEnabled = false;
            this.#log('Unfocus dim disabled');
        } catch (error) {
            this.#logError('Failed to disable unfocus dim', error);
        }
    }

    /**
     * Handle focus window change - dim unfocused, undim focused
     * @private
     */
    #onFocusWindowChanged() {
        if (!this.#unfocusDimEnabled) return;

        const focusWindow = global.display.focus_window;
        const dimLevel = this.#settings?.get_int('unfocus-dim-level') ?? 15;
        // Convert percentage (0-40) to brightness value (-1.0 to 0.0)
        const brightness = -(dimLevel / 100);

        // Get all window actors
        const windowActors = global.get_window_actors();

        for (const actor of windowActors) {
            const metaWindow = actor.get_meta_window();
            if (!metaWindow) continue;

            // Skip non-normal windows (like docks, panels, etc.)
            const windowType = metaWindow.get_window_type();
            if (windowType !== 0) continue; // 0 = META_WINDOW_NORMAL

            const isFocused = metaWindow === focusWindow;
            const existingEffect = this.#unfocusDimEffects.get(actor);

            if (isFocused) {
                // Remove dim effect from focused window
                if (existingEffect) {
                    actor.remove_effect(existingEffect);
                    this.#unfocusDimEffects.delete(actor);
                }
            } else {
                // Apply or update dim effect on unfocused window
                if (existingEffect) {
                    existingEffect.set_brightness_full(brightness, brightness, brightness);
                } else {
                    const effect = new Clutter.BrightnessContrastEffect();
                    effect.set_brightness_full(brightness, brightness, brightness);
                    actor.add_effect(effect);
                    this.#unfocusDimEffects.set(actor, effect);
                }
            }
        }
    }

    /**
     * Update dim level on all currently dimmed windows
     * @private
     */
    #updateUnfocusDimLevel() {
        const dimLevel = this.#settings?.get_int('unfocus-dim-level') ?? 15;
        const brightness = -(dimLevel / 100);

        for (const [, effect] of this.#unfocusDimEffects) {
            effect.set_brightness_full(brightness, brightness, brightness);
        }
    }

    /**
     * Disable the extension
     */
    disable() {
        try {
            // Start a performance timer
            const disableTimer = metrics.startTimer('extension_disable');
            
            this.#log('Disabling OLED Care extension');
            this.#status = OledCareExtension.STATUS.DISABLED;

            // Restore background if true black was active
            if (this.#settings?.get_boolean('true-black-background')) {
                this.#restoreBackground();
            }
            this.#bgSettings = null;

            // Restore panel and dash if hidden
            this.#showTopPanel();
            this.#showDash();

            // Remove unfocus dimming
            this.#disableUnfocusDim();

            // Disconnect error listener
            if (this.#errorListenerId) {
                errorRegistry.removeErrorListener(this.#errorListenerId);
                this.#errorListenerId = null;
            }
            
            // Remove metrics callback
            if (this.#metricsCallbackId) {
                metrics.removeCallback(this.#metricsCallbackId);
                this.#metricsCallbackId = null;
            }
            
            // Stop frame watching
            metrics.stopFrameWatching();
            
            // Disable components in reverse order of initialization
            const componentOrder = this.#getComponentInitOrder().reverse();
            
            for (const compKey of componentOrder) {
                const component = OledCareExtension.COMPONENTS[compKey];
                const instance = this.#components.get(compKey);

                if (instance) {
                    try {
                        // Call disable on the component if it has that method
                        if (typeof instance.disable === 'function') {
                            instance.disable();
                        }

                        // Call destroy if available
                        if (typeof instance.destroy === 'function') {
                            instance.destroy();
                        }

                        // Remove reference from the Map
                        this.#components.delete(compKey);
                    } catch (error) {
                        this.#logError(`Error disabling component ${component.name}`, error);
                    }
                }
            }

            // Clear private field references
            this.#dimming = null;
            this.#displayManager = null;
            this.#pixelShift = null;
            this.#pixelRefresh = null;
            
            // Remove indicator
            if (this.#indicator) {
                try {
                    this.#indicator.destroy();
                } catch (error) {
                    this.#logError('Error destroying indicator', error);
                }
                this.#indicator = null;
            }
            
            // Clean up resource bundle
            if (this.#resourceBundle) {
                this.#resourceBundle.destroy().catch(error => {
                    this.#logError('Error destroying resource bundle', error);
                });
                this.#resourceBundle = null;
            }
            
            // Clean up signal manager
            if (this.#signalManager) {
                try {
                    this.#signalManager.destroy();
                } catch (error) {
                    this.#logError('Error destroying signal manager', error);
                }
                this.#signalManager = null;
            }
            
            // Clean up resource manager
            if (this.#resourceManager) {
                try {
                    this.#resourceManager.destroy();
                } catch (error) {
                    this.#logError('Error destroying resource manager', error);
                }
                this.#resourceManager = null;
            }
            
            // Abort any pending operations
            this.#abortController.abort();
            
            // Clear any initialization promises
            this.#initPromises.clear();
            this.#components.clear();
            
            // Clear settings reference
            this.#settings = null;
            this.#componentsReady = false;
            
            // Stop performance timer
            disableTimer.stop();
            
            // Disable metrics at the end
            metrics.setEnabled(false);
            
            this.#log('OLED Care extension disabled');
        } catch (error) {
            console.error(`[${OledCareExtension.EXTENSION_ID}] Error disabling extension:`, error);
            
            // Try to stop metrics even if there's an error
            try {
                metrics.setEnabled(false);
            } catch (e) {
                console.error(`[${OledCareExtension.EXTENSION_ID}] Error disabling metrics:`, e);
            }
        }
    }

    /**
     * Open the extension preferences dialog
     */
    openPrefs() {
        this.openPreferences();
    }
    
    /**
     * Get diagnostic information about the extension
     * @returns {object} Diagnostic information
     */
    getDiagnostics() {
        const diag = {
            version: this.metadata?.version || 'unknown',
            status: this.#status,
            componentsReady: this.#componentsReady,
            hasErrors: this.#hasErrors,
            debugMode: this.#debugMode,
            components: {}
        };
        
        // Add component information
        for (const [compKey, component] of Object.entries(OledCareExtension.COMPONENTS)) {
            const instance = this.#components.get(compKey);
            diag.components[compKey] = {
                available: !!instance,
                status: instance && typeof instance.getStatus === 'function' ? 
                    instance.getStatus() : 'unknown'
            };
        }
        
        // Add errors information
        diag.errors = errorRegistry.getStatistics();
        
        // Add metrics information if available
        if (metrics.isEnabled()) {
            diag.metrics = metrics.getMetrics();
        }
        
        return diag;
    }
    
    /**
     * Log a message to the console if debug mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    #log(message) {
        if (this.#debugMode || isTestEnv) {
            console.log(`[${OledCareExtension.EXTENSION_ID}] ${message}`);
        }
    }
    
    /**
     * Log an error message
     * @param {string} message - Error message
     * @param {Error} [error] - Error object
     * @private
     */
    #logError(message, error) {
        console.error(`[${OledCareExtension.EXTENSION_ID}] ${message}`, error || '');
        
        // Track error in metrics
        metrics.incrementCounter('errors', 1, { 
            type: error?.name || 'Error',
            component: error?.component || 'Extension'
        });
        
        this.#hasErrors = true;
    }
} 