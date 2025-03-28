// GNOME imports
const { GObject, Meta, GLib, Gtk } = imports.gi;
const Main = imports.ui.main;

// Extension imports
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var DisplayManager = class DisplayManager {
    constructor(settings) {
        this._settings = settings;
        this._monitors = [];
        this._monitorManager = Meta.MonitorManager.get();
        this._useNewDisplayManager = Main.layoutManager._startingUp !== undefined;
        this._usePortalAPI = false;
        this._protectedDisplays = new Map(); // Track protection state
        
        // Validate settings early
        this._validateSettings();
        this._detectPortalSupport();
    }

    _validateSettings() {
        const requiredSettings = [
            'debug-mode',
            'enabled-displays',
            'display-brightness',
            'display-contrast'
        ];

        const schemas = this._settings.list_keys();
        for (const setting of requiredSettings) {
            if (!schemas.includes(setting)) {
                this._log(`Warning: Required setting '${setting}' not found in schema`);
            }
        }

        // Validate brightness and contrast ranges
        const brightness = this._settings.get_int('display-brightness');
        const contrast = this._settings.get_int('display-contrast');

        if (brightness < 0 || brightness > 100) {
            this._log(`Warning: Invalid brightness value ${brightness}, resetting to 50`);
            this._settings.set_int('display-brightness', 50);
        }

        if (contrast < 0 || contrast > 100) {
            this._log(`Warning: Invalid contrast value ${contrast}, resetting to 50`);
            this._settings.set_int('display-contrast', 50);
        }
    }

    _detectPortalSupport() {
        try {
            const proxy = Main.shellDBusService.shellProxy;
            this._usePortalAPI = proxy !== null;
            this._log(`Portal API support: ${this._usePortalAPI}`);
        } catch (e) {
            this._log(`Portal API detection failed: ${e.message}`);
            this._usePortalAPI = false;
        }
    }

    _log(message) {
        if (this._settings.get_boolean('debug-mode')) {
            log(`[DisplayManager] ${message}`);
        }
    }

    init() {
        this._loadEnabledDisplays();
        this._connectSignals();

        // Connect to settings changes
        this._settings.connect('changed::display-brightness', () => {
            this._onBrightnessChanged();
        });
        this._settings.connect('changed::display-contrast', () => {
            this._onContrastChanged();
        });
    }

    enable() {
        this._monitors.forEach(monitor => {
            if (this._isDisplayEnabled(monitor)) {
                this._applyProtection(monitor);
            }
        });
    }

    enableLimited() {
        // Limited functionality for lock screen
        this._monitors.forEach(monitor => {
            if (this._isDisplayEnabled(monitor)) {
                this._applyLimitedProtection(monitor);
            }
        });
    }

    disable() {
        this._monitors.forEach(monitor => {
            this._removeProtection(monitor);
        });
    }

    destroy() {
        this._log('Destroying display manager');
        if (this._displaySelectorDialog) {
            this._displaySelectorDialog.destroy();
            this._displaySelectorDialog = null;
        }

        // Remove protection from all displays
        Array.from(this._protectedDisplays.keys()).forEach(monitorId => {
            const monitor = this._monitors.find(m => this._getMonitorId(m) === monitorId);
            if (monitor) {
                this._removeProtection(monitor);
            }
        });

        this._disconnectSignals();
        this._protectedDisplays.clear();
    }

    _loadEnabledDisplays() {
        const enabledDisplays = this._settings.get_strv('enabled-displays');
        this._monitors = Main.layoutManager.monitors;
        
        // Initialize new displays with default settings
        this._monitors.forEach(monitor => {
            const monitorId = this._getMonitorId(monitor);
            if (!enabledDisplays.includes(monitorId)) {
                enabledDisplays.push(monitorId);
            }
        });

        this._settings.set_strv('enabled-displays', enabledDisplays);
    }

    _connectSignals() {
        this._monitorChangedId = this._monitorManager.connect('monitors-changed',
            this._onMonitorsChanged.bind(this));
    }

    _disconnectSignals() {
        if (this._monitorChangedId) {
            this._monitorManager.disconnect(this._monitorChangedId);
            this._monitorChangedId = null;
        }
    }

    _onMonitorsChanged() {
        this._log('Monitors changed, updating protection');
        const oldProtectedDisplays = new Map(this._protectedDisplays);
        
        this._loadEnabledDisplays();
        
        // Remove protection from disconnected displays
        oldProtectedDisplays.forEach((state, monitorId) => {
            const monitor = this._monitors.find(m => this._getMonitorId(m) === monitorId);
            if (!monitor) {
                this._log(`Display ${monitorId} disconnected, removing protection`);
                this._protectedDisplays.delete(monitorId);
            }
        });

        // Apply protection based on current session mode
        if (Main.sessionMode.currentMode === 'user') {
            this.enable();
        } else if (Main.sessionMode.currentMode === 'unlock-dialog') {
            this.enableLimited();
        }
    }

    _getMonitorId(monitor) {
        return `${monitor.manufacturer || 'unknown'}-${monitor.model || 'unknown'}-${monitor.index}`;
    }

    _isDisplayEnabled(monitor) {
        const monitorId = this._getMonitorId(monitor);
        const enabledDisplays = this._settings.get_strv('enabled-displays');
        return enabledDisplays.includes(monitorId);
    }

    _applyProtection(monitor) {
        try {
            const monitorId = this._getMonitorId(monitor);
            if (this._protectedDisplays.has(monitorId)) {
                this._log(`Display ${monitorId} already protected`);
                return;
            }

            // Implementation depends on display server and GNOME version
            if (this._usePortalAPI) {
                this._applyProtectionPortal(monitor);
            } else if (this._useNewDisplayManager) {
                this._applyProtectionNew(monitor);
            } else {
                this._applyProtectionLegacy(monitor);
            }

            this._protectedDisplays.set(monitorId, {
                brightness: this._settings.get_int('display-brightness'),
                contrast: this._settings.get_int('display-contrast'),
                timestamp: Date.now()
            });
            this._log(`Protection applied to display ${monitorId}`);
        } catch (error) {
            this._log(`Error applying protection to monitor ${monitor.index}: ${error.message}`);
        }
    }

    _applyLimitedProtection(monitor) {
        // Limited protection for lock screen
        if (this._usePortalAPI) {
            this._applyLimitedProtectionPortal(monitor);
        } else if (this._useNewDisplayManager) {
            this._applyLimitedProtectionNew(monitor);
        } else {
            this._applyLimitedProtectionLegacy(monitor);
        }
    }

    _removeProtection(monitor) {
        try {
            const monitorId = this._getMonitorId(monitor);
            if (!this._protectedDisplays.has(monitorId)) {
                this._log(`Display ${monitorId} not protected`);
                return;
            }

            // Cleanup protection effects
            if (this._usePortalAPI) {
                this._removeProtectionPortal(monitor);
            } else if (this._useNewDisplayManager) {
                this._removeProtectionNew(monitor);
            } else {
                this._removeProtectionLegacy(monitor);
            }

            this._protectedDisplays.delete(monitorId);
            this._log(`Protection removed from display ${monitorId}`);
        } catch (error) {
            this._log(`Error removing protection from monitor ${monitor.index}: ${error.message}`);
        }
    }

    // Portal API implementations (GNOME 47+)
    _applyProtectionPortal(monitor) {
        const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
        if (!monitorConfig) return;

        const brightness = this._settings.get_int('display-brightness');
        const contrast = this._settings.get_int('display-contrast');

        monitorConfig.set_power_save_mode(Meta.PowerSaveMode.ON);
        monitorConfig.set_backlight_level(brightness / 100);
        monitorConfig.set_contrast(contrast / 100);
    }

    _applyLimitedProtectionPortal(monitor) {
        const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
        if (!monitorConfig) return;

        // In limited mode, only apply basic power saving
        monitorConfig.set_power_save_mode(Meta.PowerSaveMode.ON);
    }

    _removeProtectionPortal(monitor) {
        const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
        if (!monitorConfig) return;

        monitorConfig.set_power_save_mode(Meta.PowerSaveMode.OFF);
        monitorConfig.set_backlight_level(1.0);
        monitorConfig.set_contrast(1.0);
    }

    // New API implementations (GNOME 46+)
    _applyProtectionNew(monitor) {
        const monitorManager = Meta.MonitorManager.get();
        const connector = monitorManager.get_monitor_connector(monitor.index);
        if (!connector) return;

        const brightness = this._settings.get_int('display-brightness');
        const contrast = this._settings.get_int('display-contrast');

        connector.set_backlight(brightness / 100);
        connector.set_contrast(contrast / 100);
        connector.set_power_save_mode(true);
    }

    _applyLimitedProtectionNew(monitor) {
        const monitorManager = Meta.MonitorManager.get();
        const connector = monitorManager.get_monitor_connector(monitor.index);
        if (!connector) return;

        // In limited mode, only enable power saving
        connector.set_power_save_mode(true);
    }

    _removeProtectionNew(monitor) {
        const monitorManager = Meta.MonitorManager.get();
        const connector = monitorManager.get_monitor_connector(monitor.index);
        if (!connector) return;

        connector.set_backlight(1.0);
        connector.set_contrast(1.0);
        connector.set_power_save_mode(false);
    }

    // Legacy API implementations (GNOME 45)
    _applyProtectionLegacy(monitor) {
        const display = global.display;
        if (!display) return;

        const brightness = this._settings.get_int('display-brightness');
        const contrast = this._settings.get_int('display-contrast');

        // Use legacy display configuration API
        display.set_backlight_for_monitor(monitor.index, brightness / 100);
        display.set_contrast_for_monitor(monitor.index, contrast / 100);
        display.set_power_save_mode_for_monitor(monitor.index, true);
    }

    _applyLimitedProtectionLegacy(monitor) {
        const display = global.display;
        if (!display) return;

        // In limited mode, only enable power saving
        display.set_power_save_mode_for_monitor(monitor.index, true);
    }

    _removeProtectionLegacy(monitor) {
        const display = global.display;
        if (!display) return;

        // Reset all display settings to defaults
        display.set_backlight_for_monitor(monitor.index, 1.0);
        display.set_contrast_for_monitor(monitor.index, 1.0);
        display.set_power_save_mode_for_monitor(monitor.index, false);

        // Log cleanup for debugging
        this._log(`Legacy protection removed from monitor ${monitor.index}`);
    }

    showDisplaySelector() {
        this._log('Showing display selector');
        const dialog = new Gtk.Dialog({
            title: 'OLED Care - Display Protection Settings',
            transient_for: global.get_root_window(),
            modal: true,
            use_header_bar: true
        });

        // Store dialog reference for cleanup
        this._displaySelectorDialog = dialog;

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12
        });

        const description = new Gtk.Label({
            label: 'Select the OLED displays where you want to enable protection features.\nNote: Only enable this for OLED/AMOLED displays to avoid unnecessary dimming.',
            wrap: true,
            xalign: 0
        });
        content.append(description);

        const displayList = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8
        });

        const enabledDisplays = this._settings.get_strv('enabled-displays');
        this._monitors.forEach(monitor => {
            const monitorId = this._getMonitorId(monitor);
            const row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8
            });

            const displayInfo = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4
            });

            const nameLabel = new Gtk.Label({
                label: `<b>${monitor.manufacturer || 'Unknown'} ${monitor.model || 'Display'}</b>`,
                use_markup: true,
                xalign: 0
            });
            displayInfo.append(nameLabel);

            const detailsLabel = new Gtk.Label({
                label: `Resolution: ${monitor.width}x${monitor.height}, Scale: ${monitor.scale_factor}x`,
                xalign: 0
            });
            displayInfo.append(detailsLabel);

            row.append(displayInfo);

            const switch_ = new Gtk.Switch({
                active: enabledDisplays.includes(monitorId),
                valign: Gtk.Align.CENTER
            });
            switch_.connect('notify::active', () => {
                const newEnabledDisplays = enabledDisplays.filter(id => id !== monitorId);
                if (switch_.active) {
                    newEnabledDisplays.push(monitorId);
                }
                this._settings.set_strv('enabled-displays', newEnabledDisplays);
                this._log(`Display ${monitorId} protection ${switch_.active ? 'enabled' : 'disabled'}`);
            });
            row.append(switch_);

            displayList.append(row);
        });

        content.append(displayList);
        dialog.set_child(content);

        dialog.add_button('_Close', Gtk.ResponseType.CLOSE);

        dialog.connect('response', () => {
            dialog.destroy();
            this._displaySelectorDialog = null;
            this._log('Display selector closed');
        });

        dialog.show();
    }

    getProtectionState(monitor) {
        const monitorId = this._getMonitorId(monitor);
        return this._protectedDisplays.get(monitorId) || null;
    }

    isProtected(monitor) {
        const monitorId = this._getMonitorId(monitor);
        return this._protectedDisplays.has(monitorId);
    }

    _onBrightnessChanged() {
        const brightness = this._settings.get_int('display-brightness');
        this._log(`Brightness changed to ${brightness}`);

        // Validate range
        if (brightness < 0 || brightness > 100) {
            this._log('Invalid brightness value, ignoring');
            return;
        }

        // Update all protected displays
        this._monitors.forEach(monitor => {
            if (this.isProtected(monitor)) {
                const monitorId = this._getMonitorId(monitor);
                this._protectedDisplays.get(monitorId).brightness = brightness;
                
                try {
                    if (this._usePortalAPI) {
                        const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
                        if (monitorConfig) {
                            monitorConfig.set_backlight_level(brightness / 100);
                        }
                    } else if (this._useNewDisplayManager) {
                        const connector = Meta.MonitorManager.get().get_monitor_connector(monitor.index);
                        if (connector) {
                            connector.set_backlight(brightness / 100);
                        }
                    } else {
                        const display = global.display;
                        if (display) {
                            display.set_backlight_for_monitor(monitor.index, brightness / 100);
                        }
                    }
                    this._log(`Updated brightness for display ${monitorId}`);
                } catch (error) {
                    this._log(`Error updating brightness for monitor ${monitor.index}: ${error.message}`);
                }
            }
        });
    }

    _onContrastChanged() {
        const contrast = this._settings.get_int('display-contrast');
        this._log(`Contrast changed to ${contrast}`);

        // Validate range
        if (contrast < 0 || contrast > 100) {
            this._log('Invalid contrast value, ignoring');
            return;
        }

        // Update all protected displays
        this._monitors.forEach(monitor => {
            if (this.isProtected(monitor)) {
                const monitorId = this._getMonitorId(monitor);
                this._protectedDisplays.get(monitorId).contrast = contrast;
                
                try {
                    if (this._usePortalAPI) {
                        const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
                        if (monitorConfig) {
                            monitorConfig.set_contrast(contrast / 100);
                        }
                    } else if (this._useNewDisplayManager) {
                        const connector = Meta.MonitorManager.get().get_monitor_connector(monitor.index);
                        if (connector) {
                            connector.set_contrast(contrast / 100);
                        }
                    } else {
                        const display = global.display;
                        if (display) {
                            display.set_contrast_for_monitor(monitor.index, contrast / 100);
                        }
                    }
                    this._log(`Updated contrast for display ${monitorId}`);
                } catch (error) {
                    this._log(`Error updating contrast for monitor ${monitor.index}: ${error.message}`);
                }
            }
        });
    }
}; 