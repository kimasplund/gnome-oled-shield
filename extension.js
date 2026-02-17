'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Import modules conditionally based on environment
const isTestEnv = GLib.getenv('G_TEST_SRCDIR') !== null;

const Main = isTestEnv 
    ? (await import('./tests/unit/mocks/main.js')).default 
    : (await import('resource:///org/gnome/shell/ui/main.js'));

import { Extension as BaseExtension } from 'resource:///org/gnome/shell/extensions/extension.js';

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
    
    // Private fields using true private syntax
    #dimming = null;
    #displayManager = null;
    #pixelShift = null;
    #pixelRefresh = null;
    #settings = null;
    #indicator = null;
    #signalManager = null;
    #resourceManager = null;
    #componentsReady = false;
    #hasErrors = false;
    #status = OledCareExtension.STATUS.INITIALIZING;
    #abortController = new AbortController();
    #debugMode = false;
    #components = new Map();
    #initPromises = new Map();
    #metricsCallbackId = null;
    #errorListenerId = null;
    #resourceBundle = null;

    /**
     * Constructor for the extension
     * @param {object} metadata - Extension metadata
     */
    constructor(metadata) {
        super(metadata);
        
        // Initialize error handling
        this.#initializeErrorReporting();
    }
    
    /**
     * Initialize error reporting system
     * @private
     */
    #initializeErrorReporting() {
        // Only initialize in non-test environment
        if (!isTestEnv) {
            // Handle uncaught promise rejections
            window.addEventListener('unhandledrejection', event => {
                this.#logError('Unhandled promise rejection', event.reason);
                event.preventDefault();
            }, { signal: this.#abortController.signal });
        }
        
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
            
            // Connect indicator events
            if (typeof this.#indicator.on === 'function') {
                this.#indicator.on('open-prefs', () => this.openPrefs());
                this.#indicator.on('refresh-now', () => {
                    if (this.#pixelRefresh && typeof this.#pixelRefresh.refreshNow === 'function') {
                        this.#pixelRefresh.refreshNow();
                    }
                });
            }
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
        
        this.#log('Applied all settings');
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