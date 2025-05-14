'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const Dimming = GObject.registerClass(
class Dimming extends GObject.Object {
    constructor(settings) {
        super();
        this._settings = settings;
        this._dimEffect = null;
        this._idleTimeout = null;
        this._windowDimEffects = new Map();
        this._useNewDisplayManager = Main.layoutManager._startingUp !== undefined;
        this._usePortalAPI = this._checkPortalSupport();

        // Validate settings
        this._validateSettings();
    }

    _validateSettings() {
        const requiredSettings = [
            'debug-mode',
            'dimming-level',
            'screen-dim-timeout',
            'unfocus-dim-enabled',
            'unfocus-dim-level'
        ];

        const schemas = this._settings.list_keys();
        for (const setting of requiredSettings) {
            if (!schemas.includes(setting)) {
                this._log(`Warning: Required setting '${setting}' not found in schema`);
            }
        }
    }

    _log(message) {
        if (this._settings.get_boolean('debug-mode')) {
            log(`[Dimming] ${message}`);
        }
    }

    init() {
        this._log('Initializing dimming');
        this._setupIdleWatch();
        this._setupWindowTracker();

        // Connect to settings changes
        this._settings.connect('changed::dimming-level', () => {
            this._log('Dimming level changed');
            this._updateDimming();
        });

        this._settings.connect('changed::screen-dim-timeout', () => {
            this._log('Screen dim timeout changed');
            this._updateIdleWatch();
        });

        this._settings.connect('changed::unfocus-dim-enabled', () => {
            this._log('Unfocus dim enabled changed');
            this._updateWindowDimming();
        });

        this._settings.connect('changed::unfocus-dim-level', () => {
            this._log('Unfocus dim level changed');
            this._updateWindowDimming();
        });
        this._log('Dimming initialized');
    }

    enable() {
        this._log('Enabling dimming');
        this._setupIdleWatch();
        this._setupWindowTracker();
    }

    enableLimited() {
        this._log('Enabling limited dimming');
        this._setupIdleWatch();
        // Don't enable window tracking in limited mode
    }

    disable() {
        this._log('Disabling dimming');
        this._removeIdleWatch();
        this._removeWindowTracker();
        this._removeDimming();
    }

    destroy() {
        this._log('Destroying dimming');
        this.disable();
    }

    _checkPortalSupport() {
        try {
            const proxy = Main.shellDBusService.shellProxy;
            return proxy !== null;
        } catch (e) {
            this._log('Portal API not available: ' + e.message);
            return false;
        }
    }

    _setupIdleWatch() {
        this._log('Setting up idle watch');
        this._removeIdleWatch();
        
        const timeout = this._settings.get_int('screen-dim-timeout') * 1000;
        this._idleTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
            if (this._isSystemIdle()) {
                this._log('System idle detected, applying dimming');
                this._applyDimming();
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _setupWindowTracker() {
        if (!this._settings.get_boolean('unfocus-dim-enabled')) {
            this._log('Window dimming disabled, skipping tracker setup');
            return;
        }

        this._log('Setting up window tracker');
        // Track window focus changes
        global.display.connect('notify::focus-window', () => {
            this._onWindowFocusChanged();
        });

        // Track new windows
        global.window_manager.connect('map', (_, actor) => {
            this._onWindowCreated(actor);
        });
    }

    _removeIdleWatch() {
        if (this._idleTimeout) {
            GLib.source_remove(this._idleTimeout);
            this._idleTimeout = null;
        }
    }

    _removeWindowTracker() {
        this._windowDimEffects.forEach((effect, window) => {
            this._removeWindowDimming(window);
        });
        this._windowDimEffects.clear();
    }

    _removeDimming() {
        if (this._dimEffect) {
            // Remove dimming based on display server and GNOME version
            if (this._usePortalAPI) {
                this._removeDimmingPortal();
            } else if (this._useNewDisplayManager) {
                this._removeDimmingNew();
            } else {
                this._removeDimmingLegacy();
            }
            this._dimEffect = null;
        }
    }

    _isSystemIdle() {
        const idleMonitor = Meta.IdleMonitor.get_core();
        return idleMonitor && idleMonitor.get_idletime() > 0;
    }

    _updateDimming() {
        if (this._dimEffect) {
            const dimmingLevel = this._settings.get_int('dimming-level');
            // Update dimming based on display server and GNOME version
            if (this._usePortalAPI) {
                this._updateDimmingPortal(dimmingLevel);
            } else if (this._useNewDisplayManager) {
                this._updateDimmingNew(dimmingLevel);
            } else {
                this._updateDimmingLegacy(dimmingLevel);
            }
        }
    }

    _updateIdleWatch() {
        if (this._idleTimeout) {
            this._setupIdleWatch();
        }
    }

    _updateWindowDimming() {
        const enabled = this._settings.get_boolean('unfocus-dim-enabled');
        const level = this._settings.get_int('unfocus-dim-level');

        if (enabled) {
            this._setupWindowTracker();
            this._windowDimEffects.forEach((effect, window) => {
                if (!window.has_focus()) {
                    this._applyWindowDimming(window, level);
                }
            });
        } else {
            this._removeWindowTracker();
        }
    }

    _onWindowFocusChanged() {
        const focusWindow = global.display.focus_window;
        const dimmingLevel = this._settings.get_int('unfocus-dim-level');
        this._log(`Window focus changed, applying dimming level ${dimmingLevel}`);

        this._windowDimEffects.forEach((effect, window) => {
            if (window === focusWindow) {
                this._log('Removing dimming from focused window');
                this._removeWindowDimming(window);
            } else {
                this._log('Applying dimming to unfocused window');
                this._applyWindowDimming(window, dimmingLevel);
            }
        });
    }

    _onWindowCreated(actor) {
        const window = actor.meta_window;
        if (window && !this._windowDimEffects.has(window)) {
            this._log('New window created');
            this._windowDimEffects.set(window, null);
            if (!window.has_focus()) {
                this._log('New window not focused, applying dimming');
                this._applyWindowDimming(window, this._settings.get_int('unfocus-dim-level'));
            }
        }
    }

    // Portal API implementations (GNOME 47+)
    _applyDimmingPortal() {
        const dimmingLevel = this._settings.get_int('dimming-level');
        const brightness = 1.0 - (dimmingLevel / 100);

        Main.layoutManager.monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) return;

            monitorConfig.set_backlight_level(brightness);
        });
    }

    _updateDimmingPortal(level) {
        const brightness = 1.0 - (level / 100);
        Main.layoutManager.monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) return;

            monitorConfig.set_backlight_level(brightness);
        });
    }

    _removeDimmingPortal() {
        Main.layoutManager.monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) return;

            monitorConfig.set_backlight_level(1.0);
        });
    }

    // New API implementations (GNOME 46+)
    _applyDimmingNew() {
        const dimmingLevel = this._settings.get_int('dimming-level');
        const brightness = 1.0 - (dimmingLevel / 100);
        const monitorManager = Meta.MonitorManager.get();

        Main.layoutManager.monitors.forEach(monitor => {
            const connector = monitorManager.get_monitor_connector(monitor.index);
            if (!connector) return;

            connector.set_backlight(brightness);
        });
    }

    _updateDimmingNew(level) {
        const brightness = 1.0 - (level / 100);
        const monitorManager = Meta.MonitorManager.get();

        Main.layoutManager.monitors.forEach(monitor => {
            const connector = monitorManager.get_monitor_connector(monitor.index);
            if (!connector) return;

            connector.set_backlight(brightness);
        });
    }

    _removeDimmingNew() {
        const monitorManager = Meta.MonitorManager.get();
        Main.layoutManager.monitors.forEach(monitor => {
            const connector = monitorManager.get_monitor_connector(monitor.index);
            if (!connector) return;

            connector.set_backlight(1.0);
        });
    }

    // Legacy API implementations (GNOME 45)
    _applyDimmingLegacy() {
        const dimmingLevel = this._settings.get_int('dimming-level');
        const brightness = 1.0 - (dimmingLevel / 100);
        const display = global.display;
        if (!display) return;

        Main.layoutManager.monitors.forEach(monitor => {
            display.set_backlight_for_monitor(monitor.index, brightness);
        });
    }

    _updateDimmingLegacy(level) {
        const brightness = 1.0 - (level / 100);
        const display = global.display;
        if (!display) return;

        Main.layoutManager.monitors.forEach(monitor => {
            display.set_backlight_for_monitor(monitor.index, brightness);
        });
    }

    _removeDimmingLegacy() {
        const display = global.display;
        if (!display) return;

        Main.layoutManager.monitors.forEach(monitor => {
            display.set_backlight_for_monitor(monitor.index, 1.0);
        });
    }

    // Window dimming implementations
    _applyWindowDimming(window, level) {
        if (!window || !window.get_compositor_private()) return;

        const actor = window.get_compositor_private();
        const effect = this._windowDimEffects.get(window);

        if (effect) {
            effect.set_brightness(1.0 - (level / 100));
        } else {
            const newEffect = new Clutter.BrightnessContrastEffect({
                brightness: 1.0 - (level / 100)
            });
            actor.add_effect(newEffect);
            this._windowDimEffects.set(window, newEffect);
        }
    }

    _removeWindowDimming(window) {
        if (!window || !window.get_compositor_private()) return;

        const actor = window.get_compositor_private();
        const effect = this._windowDimEffects.get(window);

        if (effect) {
            actor.remove_effect(effect);
            this._windowDimEffects.delete(window);
        }
    }
}); 