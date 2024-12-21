// GNOME imports
const { GObject, Meta, GLib } = imports.gi;
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
        
        this._detectPortalSupport();
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
        this.disable();
        this._disconnectSignals();
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
        this._loadEnabledDisplays();
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
        // Implementation depends on display server and GNOME version
        if (this._usePortalAPI) {
            this._applyProtectionPortal(monitor);
        } else if (this._useNewDisplayManager) {
            this._applyProtectionNew(monitor);
        } else {
            this._applyProtectionLegacy(monitor);
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
        // Cleanup protection effects
        if (this._usePortalAPI) {
            this._removeProtectionPortal(monitor);
        } else if (this._useNewDisplayManager) {
            this._removeProtectionNew(monitor);
        } else {
            this._removeProtectionLegacy(monitor);
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

        display.set_backlight_for_monitor(monitor.index, 1.0);
        display.set_contrast_for_monitor(monitor.index, 1.0);
        display.set_power_save_mode_for_monitor(monitor.index, false);
    }
}; 