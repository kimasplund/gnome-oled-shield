'use strict';

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * Enhanced logging function with debug mode awareness
 * @param {string} message - Message to log
 * @param {Gio.Settings} [settings] - Optional settings object to check debug mode
 */
function _log(message, settings = null) {
    // Use nullish coalescing for safer default values
    const debugMode = settings?.get_boolean('debug-mode') ?? true;
    if (debugMode) {
        log(`[OLED Care Prefs] ${message}`);
    }
}

/**
 * Enhanced error logging with more context
 * @param {Error} error - Error object to log
 * @param {string} [context] - Optional context string
 * @param {Gio.Settings} [settings] - Optional settings object to check debug mode
 */
function _logError(error, context = '', settings = null) {
    // Use nullish coalescing and optional chaining for safer access
    const debugMode = settings?.get_boolean('debug-mode') ?? true;
    if (debugMode) {
        const contextStr = context ? ` (${context})` : '';
        const message = error?.message ?? 'Unknown error';
        log(`[OLED Care Prefs] ERROR${contextStr}: ${message}`);
        // Use optional chaining and logical AND for conditional logging
        error?.stack && log(`[OLED Care Prefs] Stack trace:\n${error.stack}`);
    }
}

export default class OledCarePreferences extends ExtensionPreferences {
    // Static initialization block for constants and schema definitions
    static {
        this.DEBUG_MODE_KEY = 'debug-mode';
        
        // Define schema key groups
        this.BOOLEAN_KEYS = [
            'debug-mode', 
            'screen-dim-enabled', 
            'pixel-shift-enabled',
            'unfocus-dim-enabled',
            'true-black-background',
            'autohide-top-panel',
            'autohide-dash',
            'pixel-refresh-enabled',
            'pixel-refresh-smart',
            'pixel-refresh-running'
        ];
        
        this.INTEGER_KEYS = [
            'dimming-level', 
            'screen-dim-timeout',
            'display-brightness',
            'display-contrast',
            'unfocus-dim-level',
            'pixel-shift-interval',
            'pixel-refresh-interval',
            'pixel-refresh-speed',
            'pixel-refresh-progress',
            'pixel-refresh-time-remaining'
        ];
        
        this.STRING_KEYS = [
            'pixel-refresh-next-run'
        ];
        
        this.STRING_ARRAY_KEYS = [
            'enabled-displays',
            'pixel-refresh-schedule'
        ];
    }
    
    // Private fields using # prefix for true encapsulation
    #settings;
    #signalIds = [];
    
    /**
     * Create and populate the preferences window
     * @param {Adw.PreferencesWindow} window - The preferences window to fill
     * @returns {Adw.PreferencesWindow} The populated window
     */
    fillPreferencesWindow(window) {
        _log('Building preferences window');
        
        try {
            // Get settings
            this.#settings = this.getSettings();
            if (!this.#settings) {
                throw new Error('Failed to get extension settings');
            }
            _log('Settings loaded', this.#settings);

            // Create a preferences page
            const page = new Adw.PreferencesPage();
            window.add(page);
            
            // Validate required settings
            if (!this.#validateSettings()) {
                throw new Error('Settings validation failed');
            }

            // Build UI groups using Promise.allSettled for parallel component loading
            this.#loadAllComponents(page).catch(error => {
                _logError(error, 'component loading', this.#settings);
            });
            
        } catch (error) {
            _logError(error, 'fillPreferencesWindow');
            
            // Create an error message row
            try {
                this.#createErrorUI(window, error);
            } catch (secondaryError) {
                // If even the error UI fails, just log it
                _logError(secondaryError, 'error UI creation');
            }
        }
        
        // Return the window object to provide UI to the preferences dialog
        return window;
    }
    
    /**
     * Create error UI when preferences fail to load
     * @param {Adw.PreferencesWindow} window - The window to add error UI to
     * @param {Error} error - The error that occurred
     * @private
     */
    #createErrorUI(window, error) {
        const errorPage = new Adw.PreferencesPage();
        window.add(errorPage);
        
        const errorGroup = new Adw.PreferencesGroup({
            title: 'Error Loading Preferences'
        });
        errorPage.add(errorGroup);
        
        const errorRow = new Adw.ActionRow({
            title: 'An error occurred',
            subtitle: `${error?.message ?? 'Unknown error'}. Please check system logs for details.`
        });
        errorGroup.add(errorRow);
    }
    
    /**
     * Load all UI components in parallel with error handling
     * @param {Adw.PreferencesPage} page - The page to add components to
     * @private
     */
    async #loadAllComponents(page) {
        // Create an array of component building promises
        const componentPromises = [
            this.#buildDisplaySettings(page),
            this.#buildDimmingSettings(page),
            this.#buildWindowDimmingSettings(page),
            this.#buildPixelShiftSettings(page),
            this.#buildInterfaceSettings(page),
            this.#buildPixelRefreshSettings(page)
        ];
        
        // Execute all promises and get results
        const results = await Promise.allSettled(componentPromises);
        
        // Track failed components
        const failedComponents = results
            .map((result, index) => result.status === 'rejected' ? index : null)
            .filter(index => index !== null);
            
        if (failedComponents.length > 0) {
            _logError(
                new Error(`Failed to load components: ${failedComponents.join(', ')}`),
                'loadAllComponents',
                this.#settings
            );
        }
    }
    
    /**
     * Validate that all required settings are available
     * @returns {boolean} True if validation passed
     * @private
     */
    #validateSettings() {
        try {
            // Use static class properties for key lists
            const { BOOLEAN_KEYS, INTEGER_KEYS, STRING_KEYS, STRING_ARRAY_KEYS } = OledCarePreferences;
            
            // Check boolean keys
            for (const key of BOOLEAN_KEYS) {
                if (this.#settings.get_boolean(key) === undefined) {
                    _logError(new Error(`Missing required boolean setting: ${key}`), 'validateSettings', this.#settings);
                    return false;
                }
            }
            
            // Check integer keys
            for (const key of INTEGER_KEYS) {
                if (this.#settings.get_int(key) === undefined) {
                    _logError(new Error(`Missing required integer setting: ${key}`), 'validateSettings', this.#settings);
                    return false;
                }
            }
            
            // Check string keys
            for (const key of STRING_KEYS) {
                if (this.#settings.get_string(key) === undefined) {
                    _logError(new Error(`Missing required string setting: ${key}`), 'validateSettings', this.#settings);
                    return false;
                }
            }
            
            // Check string array keys
            for (const key of STRING_ARRAY_KEYS) {
                if (this.#settings.get_strv(key) === undefined) {
                    _logError(new Error(`Missing required string array setting: ${key}`), 'validateSettings', this.#settings);
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            _logError(error, 'validateSettings', this.#settings);
            return false;
        }
    }
    
    /**
     * Create a preferences group for display settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildDisplaySettings(page) {
        try {
            // Display settings group
            const displayGroup = new Adw.PreferencesGroup({
                title: 'Display Settings',
                description: 'Configure basic display properties'
            });
            page.add(displayGroup);

            // Screen dim enable switch
            const screenDimRow = this.#createSwitchRow({
                title: 'Enable Screen Dimming',
                subtitle: 'Automatically dim the screen when idle',
                settingsKey: 'screen-dim-enabled'
            });
            displayGroup.add(screenDimRow);

            // Display brightness
            const brightnessRow = this.#createSpinButtonRow({
                title: 'Display Brightness',
                subtitle: 'Brightness level for OLED displays (10-100%)',
                settingsKey: 'display-brightness',
                min: 10,
                max: 100,
                step: 1,
                pageStep: 10
            });
            displayGroup.add(brightnessRow);

            // Display contrast
            const contrastRow = this.#createSpinButtonRow({
                title: 'Display Contrast',
                subtitle: 'Contrast level for OLED displays (50-150%)',
                settingsKey: 'display-contrast',
                min: 50,
                max: 150,
                step: 1,
                pageStep: 10
            });
            displayGroup.add(contrastRow);
            
        } catch (error) {
            _logError(error, 'buildDisplaySettings', this.#settings);
            throw error; // Rethrow for Promise.allSettled to catch
        }
    }
    
    /**
     * Create a preferences group for dimming settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildDimmingSettings(page) {
        try {
            // Dimming settings group
            const dimmingGroup = new Adw.PreferencesGroup({
                title: 'Dimming Settings',
                description: 'Configure screen dimming behavior'
            });
            page.add(dimmingGroup);

            // Dimming level
            const dimmingRow = this.#createSpinButtonRow({
                title: 'Dimming Level',
                subtitle: 'Percentage of brightness reduction (0-50%)',
                settingsKey: 'dimming-level',
                min: 0,
                max: 50,
                step: 1,
                pageStep: 10
            });
            dimmingGroup.add(dimmingRow);

            // Screen dim timeout
            const timeoutRow = this.#createSpinButtonRow({
                title: 'Screen Dim Timeout',
                subtitle: 'Time in seconds before dimming (30-3600)',
                settingsKey: 'screen-dim-timeout',
                min: 30,
                max: 3600,
                step: 30,
                pageStep: 300
            });
            dimmingGroup.add(timeoutRow);
            
        } catch (error) {
            _logError(error, 'buildDimmingSettings', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create a preferences group for window dimming settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildWindowDimmingSettings(page) {
        try {
            // Window dimming settings group
            const windowDimGroup = new Adw.PreferencesGroup({
                title: 'Window Dimming Settings',
                description: 'Configure unfocused window dimming behavior'
            });
            page.add(windowDimGroup);

            // Window dim enable switch
            const windowDimRow = this.#createSwitchRow({
                title: 'Enable Window Dimming',
                subtitle: 'Dim unfocused windows to reduce OLED wear',
                settingsKey: 'unfocus-dim-enabled'
            });
            windowDimGroup.add(windowDimRow);

            // Window dim level
            const windowDimLevelRow = this.#createSpinButtonRow({
                title: 'Window Dim Level',
                subtitle: 'Percentage of brightness reduction for unfocused windows (0-40%)',
                settingsKey: 'unfocus-dim-level',
                min: 0,
                max: 40,
                step: 1,
                pageStep: 5
            });
            windowDimGroup.add(windowDimLevelRow);
            
        } catch (error) {
            _logError(error, 'buildWindowDimmingSettings', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create a preferences group for pixel shift settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildPixelShiftSettings(page) {
        try {
            // Pixel shift settings group
            const pixelShiftGroup = new Adw.PreferencesGroup({
                title: 'Pixel Shift Settings',
                description: 'Configure pixel shifting behavior'
            });
            page.add(pixelShiftGroup);

            // Pixel shift enable switch
            const pixelShiftRow = this.#createSwitchRow({
                title: 'Enable Pixel Shift',
                subtitle: 'Periodically shift pixels to prevent burn-in',
                settingsKey: 'pixel-shift-enabled'
            });
            pixelShiftGroup.add(pixelShiftRow);

            // Pixel shift interval
            const shiftIntervalRow = this.#createSpinButtonRow({
                title: 'Pixel Shift Interval',
                subtitle: 'Time in seconds between shifts (60-3600)',
                settingsKey: 'pixel-shift-interval',
                min: 60,
                max: 3600,
                step: 60,
                pageStep: 300
            });
            pixelShiftGroup.add(shiftIntervalRow);
            
        } catch (error) {
            _logError(error, 'buildPixelShiftSettings', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create a preferences group for interface settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildInterfaceSettings(page) {
        try {
            // Interface settings group
            const interfaceGroup = new Adw.PreferencesGroup({
                title: 'Interface Settings',
                description: 'Configure interface elements behavior'
            });
            page.add(interfaceGroup);

            // True black background switch
            const blackBgRow = this.#createSwitchRow({
                title: 'True Black Background',
                subtitle: 'Set desktop background to pure black to turn off unused pixels',
                settingsKey: 'true-black-background'
            });
            interfaceGroup.add(blackBgRow);

            // Panel auto-hide switch
            const panelHideRow = this.#createSwitchRow({
                title: 'Auto-hide Top Panel',
                subtitle: 'Hide the top panel when not in use',
                settingsKey: 'autohide-top-panel'
            });
            interfaceGroup.add(panelHideRow);

            // Dash auto-hide switch
            const dashHideRow = this.#createSwitchRow({
                title: 'Auto-hide Dash',
                subtitle: 'Hide the dash/dock when not in use',
                settingsKey: 'autohide-dash'
            });
            interfaceGroup.add(dashHideRow);
            
        } catch (error) {
            _logError(error, 'buildInterfaceSettings', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create a preferences group for pixel refresh settings
     * @param {Adw.PreferencesPage} page - The page to add the group to
     * @private
     */
    #buildPixelRefreshSettings(page) {
        try {
            // Pixel Refresh settings group
            const refreshGroup = new Adw.PreferencesGroup({
                title: 'Pixel Refresh Settings',
                description: 'Configure periodic pixel refresh behavior'
            });
            page.add(refreshGroup);

            // Enable pixel refresh
            const refreshRow = this.#createSwitchRow({
                title: 'Enable Pixel Refresh',
                subtitle: 'Run a white line across the screen periodically to refresh pixels',
                settingsKey: 'pixel-refresh-enabled'
            });
            refreshGroup.add(refreshRow);

            // Refresh interval
            const refreshIntervalRow = this.#createSpinButtonRow({
                title: 'Refresh Interval',
                subtitle: 'Time in minutes between refresh cycles (60-1440)',
                settingsKey: 'pixel-refresh-interval',
                min: 60,
                max: 1440,
                step: 30,
                pageStep: 60
            });
            refreshGroup.add(refreshIntervalRow);

            // Refresh speed
            const speedRow = this.#createSpinButtonRow({
                title: 'Refresh Line Speed',
                subtitle: 'Speed of the refresh line movement (1-5, slower to faster)',
                settingsKey: 'pixel-refresh-speed',
                min: 1,
                max: 5,
                step: 1,
                pageStep: 1
            });
            refreshGroup.add(speedRow);

            // Smart refresh
            const smartRow = this.#createSwitchRow({
                title: 'Smart Refresh',
                subtitle: 'Only run when system is idle and no fullscreen apps are active',
                settingsKey: 'pixel-refresh-smart'
            });
            refreshGroup.add(smartRow);

            // Schedule editor
            this.#buildScheduleEditor(refreshGroup);
            
            // Status indicator
            this.#buildStatusIndicator(refreshGroup);
            
            // Manual control buttons
            this.#buildManualControls(refreshGroup);
            
        } catch (error) {
            _logError(error, 'buildPixelRefreshSettings', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create the schedule editor UI component
     * @param {Adw.PreferencesGroup} group - The group to add the component to
     * @private
     */
    #buildScheduleEditor(group) {
        try {
            const scheduleRow = new Adw.ActionRow({
                title: 'Refresh Schedule',
                subtitle: 'Times when pixel refresh can run (24-hour format)'
            });
            
            const scheduleEntry = new Gtk.Entry({
                text: this.#settings.get_strv('pixel-refresh-schedule').join(', '),
                valign: Gtk.Align.CENTER,
                width_chars: 30
            });
            
            const changeId = scheduleEntry.connect('changed', () => {
                const times = scheduleEntry.get_text()
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t));
                this.#settings.set_strv('pixel-refresh-schedule', times);
            });
            
            // Track signal for cleanup
            this.#trackSignal(scheduleEntry, changeId, 'changed');
            
            scheduleRow.add_suffix(scheduleEntry);
            group.add(scheduleRow);
            
        } catch (error) {
            _logError(error, 'buildScheduleEditor', this.#settings);
            throw error;
        }
    }
    
    /**
     * Create the status indicator UI component
     * @param {Adw.PreferencesGroup} group - The group to add the component to
     * @private
     */
    #buildStatusIndicator(group) {
        try {
            const statusRow = new Adw.ActionRow({
                title: 'Status',
            });
            
            const statusBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 6,
                margin_bottom: 6,
                valign: Gtk.Align.CENTER
            });

            const statusLabel = new Gtk.Label({
                label: 'Idle',
                css_classes: ['caption', 'dim-label']
            });

            const nextRunLabel = new Gtk.Label({
                label: 'Next run: Not scheduled',
                css_classes: ['caption', 'dim-label']
            });

            const timeRemainingLabel = new Gtk.Label({
                label: '',
                css_classes: ['caption', 'dim-label']
            });

            const progressBar = new Gtk.ProgressBar({
                fraction: 0,
                visible: false
            });

            statusBox.append(statusLabel);
            statusBox.append(nextRunLabel);
            statusBox.append(timeRemainingLabel);
            statusBox.append(progressBar);
            statusRow.add_suffix(statusBox);
            group.add(statusRow);

            // Update status indicators when settings change - with modern signal handling
            this.#trackSignal(
                this.#settings, 
                this.#settings.connect('changed::pixel-refresh-running', () => {
                    const running = this.#settings.get_boolean('pixel-refresh-running');
                    statusLabel.set_text(running ? 'Running' : 'Idle');
                    statusLabel.set_css_classes(running ? ['caption', 'accent'] : ['caption', 'dim-label']);
                    progressBar.set_visible(running);
                    timeRemainingLabel.set_visible(running);
                }),
                'changed::pixel-refresh-running'
            );

            this.#trackSignal(
                this.#settings,
                this.#settings.connect('changed::pixel-refresh-progress', () => {
                    const progress = this.#settings.get_int('pixel-refresh-progress');
                    progressBar.set_fraction(progress / 100.0);
                    if (progress > 0) {
                        progressBar.set_text(`${progress}%`);
                        progressBar.set_show_text(true);
                    }
                }),
                'changed::pixel-refresh-progress'
            );

            this.#trackSignal(
                this.#settings,
                this.#settings.connect('changed::pixel-refresh-time-remaining', () => {
                    const seconds = this.#settings.get_int('pixel-refresh-time-remaining');
                    if (seconds > 0) {
                        const minutes = Math.floor(seconds / 60);
                        const secs = seconds % 60;
                        timeRemainingLabel.set_text(
                            `Time remaining: ${minutes}:${secs.toString().padStart(2, '0')}`
                        );
                    } else {
                        timeRemainingLabel.set_text('');
                    }
                }),
                'changed::pixel-refresh-time-remaining'
            );

            this.#trackSignal(
                this.#settings,
                this.#settings.connect('changed::pixel-refresh-next-run', () => {
                    const nextRun = this.#settings.get_string('pixel-refresh-next-run');
                    if (nextRun) {
                        const date = new Date(nextRun);
                        const timeString = date.toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        nextRunLabel.set_text(`Next run: ${timeString}`);
                    } else {
                        nextRunLabel.set_text('Next run: Not scheduled');
                    }
                }),
                'changed::pixel-refresh-next-run'
            );
            
        } catch (error) {
            _logError(error, 'buildStatusIndicator', this.#settings);
            throw error;
        }
    }
    
    /**
     * Track a signal connection for later cleanup
     * @param {object} object - The object the signal is connected to
     * @param {number} id - The signal connection ID 
     * @param {string} name - The signal name
     * @private
     */
    #trackSignal(object, id, name) {
        // Use logical assignment operator to initialize array if needed
        this.#signalIds ??= [];
        this.#signalIds.push({ object, id, name });
    }
    
    /**
     * Create the manual control buttons UI component
     * @param {Adw.PreferencesGroup} group - The group to add the component to
     * @private
     */
    #buildManualControls(group) {
        try {
            const manualControlRow = new Adw.ActionRow({
                title: 'Manual Control',
                subtitle: 'Run or cancel pixel refresh manually'
            });

            const buttonBox = new Gtk.Box({
                spacing: 8,
                homogeneous: true,
                valign: Gtk.Align.CENTER
            });

            const runButton = new Gtk.Button({
                label: 'Run Now',
                css_classes: ['suggested-action'],
                sensitive: !this.#settings.get_boolean('pixel-refresh-running')
            });

            const cancelButton = new Gtk.Button({
                label: 'Cancel',
                css_classes: ['destructive-action'],
                sensitive: this.#settings.get_boolean('pixel-refresh-running')
            });

            // Using arrow functions and tracking signals
            this.#trackSignal(
                runButton, 
                runButton.connect('clicked', () => {
                    this.#settings.set_boolean('pixel-refresh-manual-trigger', true);
                }),
                'clicked'
            );

            this.#trackSignal(
                cancelButton,
                cancelButton.connect('clicked', () => {
                    this.#settings.set_boolean('pixel-refresh-manual-cancel', true);
                }),
                'clicked'
            );

            buttonBox.append(runButton);
            buttonBox.append(cancelButton);
            manualControlRow.add_suffix(buttonBox);
            group.add(manualControlRow);
            
            // Update button sensitivity when running state changes
            this.#trackSignal(
                this.#settings,
                this.#settings.connect('changed::pixel-refresh-running', () => {
                    const running = this.#settings.get_boolean('pixel-refresh-running');
                    runButton.set_sensitive(!running);
                    cancelButton.set_sensitive(running);
                }),
                'changed::pixel-refresh-running'
            );
            
        } catch (error) {
            _logError(error, 'buildManualControls', this.#settings);
            throw error;
        }
    }
    
    /**
     * Helper function to create a switch row
     * @param {Object} options - Options object
     * @param {string} options.title - The row title
     * @param {string} options.subtitle - The row subtitle
     * @param {string} options.settingsKey - The settings key to bind to
     * @returns {Adw.ActionRow} The created row
     * @private
     */
    #createSwitchRow({ title, subtitle, settingsKey }) {
        const row = new Adw.ActionRow({
            title,
            subtitle
        });
        
        const switchWidget = new Gtk.Switch({
            active: this.#settings.get_boolean(settingsKey),
            valign: Gtk.Align.CENTER
        });
        
        row.add_suffix(switchWidget);
        
        this.#settings.bind(
            settingsKey,
            switchWidget,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        return row;
    }
    
    /**
     * Helper function to create a spin button row
     * @param {Object} options - Options object
     * @param {string} options.title - The row title
     * @param {string} options.subtitle - The row subtitle
     * @param {string} options.settingsKey - The settings key to bind to
     * @param {number} options.min - Minimum value
     * @param {number} options.max - Maximum value
     * @param {number} options.step - Step increment
     * @param {number} options.pageStep - Page increment
     * @returns {Adw.ActionRow} The created row
     * @private
     */
    #createSpinButtonRow({ title, subtitle, settingsKey, min, max, step, pageStep }) {
        const row = new Adw.ActionRow({
            title,
            subtitle
        });
        
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: pageStep,
            value: this.#settings.get_int(settingsKey)
        });
        
        const spinButton = new Gtk.SpinButton({
            adjustment,
            climb_rate: 1,
            digits: 0,
            numeric: true,
            valign: Gtk.Align.CENTER
        });
        
        row.add_suffix(spinButton);
        
        this.#settings.bind(
            settingsKey,
            spinButton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        return row;
    }
    
    /**
     * Clean up resources when the preferences dialog is closed
     */
    destroy() {
        // Disconnect all tracked signals
        for (const signal of this.#signalIds ?? []) {
            // Use optional chaining to safely access properties
            signal?.object?.disconnect?.(signal.id);
        }
        
        // Clear arrays
        this.#signalIds = [];
        
        // Clear references
        this.#settings = null;
        
        // Call parent method if it exists
        if (super.destroy) {
            super.destroy();
        }
    }
} 