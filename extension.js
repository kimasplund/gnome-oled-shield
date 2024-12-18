'use strict';

const { GObject, Gio, Meta, Shell, Clutter, St, GLib, ByteArray } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Background = imports.ui.background;
const Dash = imports.ui.dash;
const Config = imports.misc.config;
const DisplayManager = imports.ui.displayManager;

const PIXEL_SHIFT_AMOUNT = 1; // pixels to shift

const GNOME_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

let OledCareIndicator = GObject.registerClass(
class OledCareIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'OLED Care Indicator');

        this._settings = ExtensionUtils.getSettings();
        this._monitors = [];
        this._dimEffect = null;
        this._pixelShiftTimeout = null;
        this._idleTimeout = null;
        this._currentShift = { x: 0, y: 0 };
        this._windowDimEffects = new Map();
        this._originalBackground = null;
        this._panelShowId = null;
        this._panelHideId = null;
        this._refreshLines = new Map();
        this._refreshTimeout = null;

        // Create the panel icon
        let icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon'
        });
        this.add_child(icon);

        this._buildMenu();
        this._bindSettings();
        this._setupMonitors();
        this._setupIdleWatch();
        this._setupWindowTracker();
        this._setupAutoHide();
        this._setupPixelRefresh();
    }

    _buildMenu() {
        // Add monitor selection submenu
        let monitorsMenu = new PopupMenu.PopupSubMenuMenuItem('Monitors');
        this.menu.addMenuItem(monitorsMenu);

        // Get all monitors
        let monitors = Main.layoutManager.monitors;
        monitors.forEach((monitor, index) => {
            let monitorItem = new PopupMenu.PopupSwitchMenuItem(
                `Monitor ${index + 1}`,
                this._isMonitorEnabled(monitor)
            );
            monitorItem.connect('toggled', (item) => {
                this._toggleMonitor(monitor, item.state);
            });
            monitorsMenu.menu.addMenuItem(monitorItem);
        });

        // Add pixel shift toggle
        this._pixelShiftSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Pixel Shift',
            this._settings.get_boolean('pixel-shift-enabled')
        );
        this._pixelShiftSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('pixel-shift-enabled', item.state);
        });
        this.menu.addMenuItem(this._pixelShiftSwitch);

        // Add window dim toggle
        this._windowDimSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Dim Unfocused Windows',
            this._settings.get_boolean('unfocus-dim-enabled')
        );
        this._windowDimSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('unfocus-dim-enabled', item.state);
        });
        this.menu.addMenuItem(this._windowDimSwitch);

        // Add true black background toggle
        this._blackBgSwitch = new PopupMenu.PopupSwitchMenuItem(
            'True Black Background',
            this._settings.get_boolean('true-black-background')
        );
        this._blackBgSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('true-black-background', item.state);
        });
        this.menu.addMenuItem(this._blackBgSwitch);

        // Add panel auto-hide toggle
        this._panelHideSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Auto-hide Top Panel',
            this._settings.get_boolean('autohide-top-panel')
        );
        this._panelHideSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('autohide-top-panel', item.state);
        });
        this.menu.addMenuItem(this._panelHideSwitch);

        // Add dash auto-hide toggle
        this._dashHideSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Auto-hide Dash',
            this._settings.get_boolean('autohide-dash')
        );
        this._dashHideSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('autohide-dash', item.state);
        });
        this.menu.addMenuItem(this._dashHideSwitch);

        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Add settings button
        let settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            ExtensionUtils.openPreferences();
        });
        this.menu.addMenuItem(settingsItem);

        // Add pixel refresh toggle
        this._pixelRefreshSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Scheduled Pixel Refresh',
            this._settings.get_boolean('pixel-refresh-enabled')
        );
        this._pixelRefreshSwitch.connect('toggled', (item) => {
            this._settings.set_boolean('pixel-refresh-enabled', item.state);
        });
        this.menu.addMenuItem(this._pixelRefreshSwitch);
    }

    _bindSettings() {
        this._settings.connect('changed::enabled-displays', () => {
            this._updateMonitors();
        });

        this._settings.connect('changed::pixel-shift-enabled', () => {
            this._updatePixelShift();
        });

        this._settings.connect('changed::pixel-shift-interval', () => {
            this._updatePixelShift();
        });

        this._settings.connect('changed::dimming-level', () => {
            this._updateDimming();
        });

        this._settings.connect('changed::unfocus-dim-enabled', () => {
            this._updateWindowDimming();
        });

        this._settings.connect('changed::unfocus-dim-level', () => {
            this._updateWindowDimming();
        });

        this._settings.connect('changed::true-black-background', () => {
            this._updateBackground();
        });

        this._settings.connect('changed::autohide-top-panel', () => {
            this._updatePanelAutoHide();
        });

        this._settings.connect('changed::autohide-dash', () => {
            this._updateDashAutoHide();
        });

        this._settings.connect('changed::pixel-refresh-manual-trigger', () => {
            if (this._settings.get_boolean('pixel-refresh-manual-trigger')) {
                this._runPixelRefresh();
                // Reset the trigger
                this._settings.set_boolean('pixel-refresh-manual-trigger', false);
            }
        });

        this._settings.connect('changed::pixel-refresh-manual-cancel', () => {
            if (this._settings.get_boolean('pixel-refresh-manual-cancel')) {
                this._cancelPixelRefresh();
                // Reset the cancel flag
                this._settings.set_boolean('pixel-refresh-manual-cancel', false);
            }
        });
    }

    _setupWindowTracker() {
        this._windowTracker = Shell.WindowTracker.get_default();
        this._focusWindow = global.display.focus_window;
        
        // Connect to window focus changes
        this._windowFocusId = global.display.connect('notify::focus-window', 
            this._onWindowFocusChanged.bind(this));
        
        // Connect to window creation
        this._windowCreatedId = global.display.connect('window-created',
            this._onWindowCreated.bind(this));

        // Initial setup of existing windows
        global.get_window_actors().forEach(actor => {
            this._setupWindowDimming(actor);
        });
    }

    _onWindowFocusChanged() {
        let focusWindow = global.display.focus_window;
        
        if (this._settings.get_boolean('unfocus-dim-enabled')) {
            // Update dimming for previously focused window
            if (this._focusWindow) {
                this._dimWindow(this._focusWindow);
            }
            
            // Remove dimming from newly focused window
            if (focusWindow) {
                this._undimWindow(focusWindow);
            }
        }
        
        this._focusWindow = focusWindow;
    }

    _onWindowCreated(display, metaWindow) {
        let actor = metaWindow.get_compositor_private();
        if (actor) {
            this._setupWindowDimming(actor);
        }
    }

    _setupWindowDimming(actor) {
        if (!actor || !actor.meta_window || actor.meta_window.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        let effect = new Clutter.BrightnessContrastEffect();
        actor.add_effect(effect);
        this._windowDimEffects.set(actor.meta_window, effect);

        if (this._settings.get_boolean('unfocus-dim-enabled') && 
            actor.meta_window !== global.display.focus_window) {
            this._dimWindow(actor.meta_window);
        }
    }

    _dimWindow(metaWindow) {
        let effect = this._windowDimEffects.get(metaWindow);
        if (effect) {
            let dimLevel = this._settings.get_int('unfocus-dim-level');
            effect.set_brightness(dimLevel / -100.0);
        }
    }

    _undimWindow(metaWindow) {
        let effect = this._windowDimEffects.get(metaWindow);
        if (effect) {
            effect.set_brightness(0.0);
        }
    }

    _updateWindowDimming() {
        let enabled = this._settings.get_boolean('unfocus-dim-enabled');
        
        global.get_window_actors().forEach(actor => {
            if (actor.meta_window && actor.meta_window.get_window_type() === Meta.WindowType.NORMAL) {
                if (enabled && actor.meta_window !== global.display.focus_window) {
                    this._dimWindow(actor.meta_window);
                } else {
                    this._undimWindow(actor.meta_window);
                }
            }
        });
    }

    _setupMonitors() {
        this._monitors = Main.layoutManager.monitors;
        this._updateMonitors();
    }

    _setupIdleWatch() {
        this._idleMonitor = Meta.IdleMonitor.get_core();
        let timeout = this._settings.get_int('screen-dim-timeout');
        
        this._idleTimeout = this._idleMonitor.add_idle_watch(timeout * 1000, () => {
            this._applyDimming();
        });

        this._idleMonitor.add_user_active_watch(() => {
            this._removeDimming();
        });
    }

    _isMonitorEnabled(monitor) {
        let enabledDisplays = this._settings.get_strv('enabled-displays');
        return enabledDisplays.includes(monitor.index.toString());
    }

    _toggleMonitor(monitor, enabled) {
        let enabledDisplays = this._settings.get_strv('enabled-displays');
        let index = monitor.index.toString();
        
        if (enabled && !enabledDisplays.includes(index)) {
            enabledDisplays.push(index);
        } else if (!enabled) {
            enabledDisplays = enabledDisplays.filter(id => id !== index);
        }
        
        this._settings.set_strv('enabled-displays', enabledDisplays);
    }

    _updateMonitors() {
        this._monitors.forEach(monitor => {
            if (this._isMonitorEnabled(monitor)) {
                this._setupMonitorProtection(monitor);
            } else {
                this._removeMonitorProtection(monitor);
            }
        });
    }

    _setupMonitorProtection(monitor) {
        // Apply initial dimming if needed
        this._updateDimming();

        // Setup pixel shift if enabled
        if (this._settings.get_boolean('pixel-shift-enabled')) {
            this._updatePixelShift();
        }
    }

    _removeMonitorProtection(monitor) {
        // Remove effects from the monitor
        this._removeDimming();
        this._removePixelShift();
    }

    _updatePixelShift() {
        this._removePixelShift();

        if (this._settings.get_boolean('pixel-shift-enabled')) {
            let interval = this._settings.get_int('pixel-shift-interval') * 1000;
            this._pixelShiftTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
                this._shiftPixels();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _shiftPixels() {
        let enabledDisplays = this._settings.get_strv('enabled-displays');
        this._monitors.forEach(monitor => {
            if (enabledDisplays.includes(monitor.index.toString())) {
                // Calculate new shift
                this._currentShift.x = (this._currentShift.x + PIXEL_SHIFT_AMOUNT) % 3 - 1;
                this._currentShift.y = (this._currentShift.y + PIXEL_SHIFT_AMOUNT) % 3 - 1;

                // Apply shift through monitor's actor
                let actor = Main.layoutManager.monitors[monitor.index].actor;
                actor.set_position(this._currentShift.x, this._currentShift.y);
            }
        });
    }

    _removePixelShift() {
        if (this._pixelShiftTimeout) {
            GLib.source_remove(this._pixelShiftTimeout);
            this._pixelShiftTimeout = null;
        }

        // Reset all monitor positions
        this._monitors.forEach(monitor => {
            let actor = Main.layoutManager.monitors[monitor.index].actor;
            if (actor) {
                actor.set_position(0, 0);
            }
        });
    }

    _applyDimming() {
        let dimmingLevel = this._settings.get_int('dimming-level');
        let enabledDisplays = this._settings.get_strv('enabled-displays');

        this._monitors.forEach(monitor => {
            if (enabledDisplays.includes(monitor.index.toString())) {
                let actor = Main.layoutManager.monitors[monitor.index].actor;
                if (!this._dimEffect) {
                    this._dimEffect = new Clutter.BrightnessContrastEffect();
                }
                actor.add_effect(this._dimEffect);
                this._dimEffect.set_brightness(dimmingLevel / -100.0);
            }
        });
    }

    _removeDimming() {
        this._monitors.forEach(monitor => {
            let actor = Main.layoutManager.monitors[monitor.index].actor;
            if (actor && this._dimEffect) {
                actor.remove_effect(this._dimEffect);
            }
        });
        this._dimEffect = null;
    }

    _updateDimming() {
        // Update dimming level if already applied
        if (this._dimEffect) {
            this._applyDimming();
        }
    }

    _setupAutoHide() {
        // Initial setup of auto-hide features
        this._updatePanelAutoHide();
        this._updateDashAutoHide();
        this._updateBackground();
    }

    _updateBackground() {
        let trueBlack = this._settings.get_boolean('true-black-background');
        
        if (trueBlack) {
            // Store current background settings if not already stored
            if (!this._originalBackground) {
                this._originalBackground = {
                    schema: new Gio.Settings({ schema: 'org.gnome.desktop.background' }),
                    picture_uri: null,
                    picture_uri_dark: null,
                    color: null,
                    color_shading_type: null
                };

                this._originalBackground.picture_uri = this._originalBackground.schema.get_string('picture-uri');
                this._originalBackground.picture_uri_dark = this._originalBackground.schema.get_string('picture-uri-dark');
                this._originalBackground.color = this._originalBackground.schema.get_string('primary-color');
                this._originalBackground.color_shading_type = this._originalBackground.schema.get_string('color-shading-type');
            }

            // Set true black background
            let bgSettings = new Gio.Settings({ schema: 'org.gnome.desktop.background' });
            bgSettings.set_string('picture-uri', '');
            bgSettings.set_string('picture-uri-dark', '');
            bgSettings.set_string('primary-color', '#000000');
            bgSettings.set_string('secondary-color', '#000000');
            bgSettings.set_string('color-shading-type', 'solid');
        } else if (this._originalBackground) {
            // Restore original background settings
            let bgSettings = this._originalBackground.schema;
            bgSettings.set_string('picture-uri', this._originalBackground.picture_uri);
            bgSettings.set_string('picture-uri-dark', this._originalBackground.picture_uri_dark);
            bgSettings.set_string('primary-color', this._originalBackground.color);
            bgSettings.set_string('color-shading-type', this._originalBackground.color_shading_type);
            
            this._originalBackground = null;
        }
    }

    _updatePanelAutoHide() {
        let autoHide = this._settings.get_boolean('autohide-top-panel');
        let panel = Main.panel;

        if (autoHide) {
            // Make panel reactive to hover
            panel.reactive = true;

            // Add hover handlers if not already added
            if (!this._panelShowId) {
                this._panelShowId = panel.connect('enter-event', () => {
                    panel.ease({
                        opacity: 255,
                        duration: 300,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD
                    });
                });
            }

            if (!this._panelHideId) {
                this._panelHideId = panel.connect('leave-event', () => {
                    let [x, y] = global.get_pointer();
                    // Only hide if mouse is not in the panel area
                    if (y > panel.height) {
                        panel.ease({
                            opacity: 0,
                            duration: 300,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD
                        });
                    }
                });
            }

            // Initially hide panel
            panel.ease({
                opacity: 0,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        } else {
            // Remove hover handlers
            if (this._panelShowId) {
                panel.disconnect(this._panelShowId);
                this._panelShowId = null;
            }
            if (this._panelHideId) {
                panel.disconnect(this._panelHideId);
                this._panelHideId = null;
            }

            // Show panel
            panel.ease({
                opacity: 255,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        }
    }

    _updateDashAutoHide() {
        let autoHide = this._settings.get_boolean('autohide-dash');
        let dash = Main.overview.dash;

        if (dash && dash.dash) {
            // Set dash to auto-hide mode
            dash.dash.setAutohideFlag(autoHide);
        }
    }

    _setupPixelRefresh() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        if (this._settings.get_boolean('pixel-refresh-enabled')) {
            this._scheduleNextRefresh();
        }
    }

    _scheduleNextRefresh() {
        let now = GLib.DateTime.new_now_local();
        let schedule = this._settings.get_strv('pixel-refresh-schedule');
        let nextTime = null;

        // Find the next scheduled time
        for (let timeStr of schedule) {
            let [hour, minute] = timeStr.split(':').map(n => parseInt(n));
            let scheduledTime = GLib.DateTime.new_local(
                now.get_year(),
                now.get_month(),
                now.get_day(),
                hour,
                minute,
                0
            );

            // If time has passed today, try tomorrow
            if (scheduledTime.compare(now) <= 0) {
                scheduledTime = scheduledTime.add_days(1);
            }

            if (!nextTime || scheduledTime.compare(nextTime) < 0) {
                nextTime = scheduledTime;
            }
        }

        if (nextTime) {
            // Store next run time
            this._settings.set_string('pixel-refresh-next-run', 
                nextTime.format_iso8601());

            let deltaSeconds = nextTime.difference(now) / 1000000;
            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                deltaSeconds,
                () => {
                    this._checkAndRunRefresh();
                    return GLib.SOURCE_REMOVE;
                }
            );
        } else {
            this._settings.set_string('pixel-refresh-next-run', '');
        }
    }

    _checkAndRunRefresh() {
        if (!this._settings.get_boolean('pixel-refresh-enabled')) return;

        let canRun = true;
        if (this._settings.get_boolean('pixel-refresh-smart')) {
            // Check if system is idle
            let idleTime = this._idleMonitor.get_idletime();
            let isIdle = idleTime > 60000; // 1 minute

            // Check for fullscreen windows
            let hasFullscreen = global.get_window_actors().some(actor => {
                let win = actor.meta_window;
                return win && win.is_fullscreen();
            });

            canRun = isIdle && !hasFullscreen;
        }

        if (canRun) {
            this._runPixelRefresh();
        } else {
            // Try again in 5 minutes
            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                300,
                () => {
                    this._checkAndRunRefresh();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    }

    _runPixelRefresh() {
        // Set running status
        this._settings.set_boolean('pixel-refresh-running', true);
        this._settings.set_int('pixel-refresh-progress', 0);
        this._settings.set_int('pixel-refresh-time-remaining', 0);

        let speed = this._settings.get_int('pixel-refresh-speed');
        let enabledDisplays = this._settings.get_strv('enabled-displays');

        this._monitors.forEach(monitor => {
            if (enabledDisplays.includes(monitor.index.toString())) {
                let line = new PixelRefreshLine(monitor);
                line.setSettings(this._settings);
                this._refreshLines.set(monitor.index, line);
                line.start(speed);
            }
        });

        // Schedule cleanup
        let maxDuration = (Math.max(6 - speed, 1) * 2) * 
            Math.max(...this._monitors.map(m => m.height)) + 1000;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, maxDuration, () => {
            this._refreshLines.forEach(line => {
                line.destroy();
            });
            this._refreshLines.clear();
            
            // Reset status
            this._settings.set_boolean('pixel-refresh-running', false);
            this._settings.set_int('pixel-refresh-progress', 0);
            this._settings.set_int('pixel-refresh-time-remaining', 0);
            
            // Schedule next run
            this._scheduleNextRefresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPixelRefresh() {
        // Clean up any running refresh
        this._refreshLines.forEach(line => {
            line.destroy();
        });
        this._refreshLines.clear();

        // Reset status
        this._settings.set_boolean('pixel-refresh-running', false);
        this._settings.set_int('pixel-refresh-progress', 0);
        this._settings.set_int('pixel-refresh-time-remaining', 0);

        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        // Reschedule if automatic refresh is enabled
        if (this._settings.get_boolean('pixel-refresh-enabled')) {
            this._scheduleNextRefresh();
        } else {
            this._settings.set_string('pixel-refresh-next-run', '');
        }
    }

    destroy() {
        // Restore background if needed
        if (this._originalBackground) {
            let bgSettings = this._originalBackground.schema;
            bgSettings.set_string('picture-uri', this._originalBackground.picture_uri);
            bgSettings.set_string('picture-uri-dark', this._originalBackground.picture_uri_dark);
            bgSettings.set_string('primary-color', this._originalBackground.color);
            bgSettings.set_string('color-shading-type', this._originalBackground.color_shading_type);
        }

        // Remove panel auto-hide
        if (this._panelShowId) {
            Main.panel.disconnect(this._panelShowId);
        }
        if (this._panelHideId) {
            Main.panel.disconnect(this._panelHideId);
        }
        Main.panel.opacity = 255;

        // Restore dash settings
        let dash = Main.overview.dash;
        if (dash && dash.dash) {
            dash.dash.setAutohideFlag(true); // Reset to default
        }

        this._removePixelShift();
        this._removeDimming();
        
        if (this._idleTimeout) {
            this._idleMonitor.remove_watch(this._idleTimeout);
            this._idleTimeout = null;
        }

        if (this._windowFocusId) {
            global.display.disconnect(this._windowFocusId);
        }

        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
        }

        // Clean up window effects
        this._windowDimEffects.forEach((effect, metaWindow) => {
            let actor = metaWindow.get_compositor_private();
            if (actor) {
                actor.remove_effect(effect);
            }
        });
        this._windowDimEffects.clear();

        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        this._refreshLines.forEach(line => {
            line.destroy();
        });
        this._refreshLines.clear();

        super.destroy();
    }
});

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations();
        this._versionSpecificInit();
    }

    _versionSpecificInit() {
        // Version-specific initializations
        switch (GNOME_VERSION) {
            case 47:
                // GNOME 47 specific features
                this._initGnome47Features();
                break;
            case 46:
                // GNOME 46 specific features
                this._initGnome46Features();
                break;
            case 45:
                // GNOME 45 specific features
                this._initGnome45Features();
                break;
            default:
                log('Unsupported GNOME version: ' + GNOME_VERSION);
                return;
        }
    }

    _initGnome47Features() {
        // GNOME 47 specific implementations
        this._useNewDisplayManager = true;
        this._useNewBackgroundManager = true;
        this._usePortalAPI = true;
    }

    _initGnome46Features() {
        // GNOME 46 specific implementations
        this._useNewDisplayManager = true;
        this._useNewBackgroundManager = true;
        this._usePortalAPI = false;
    }

    _initGnome45Features() {
        // GNOME 45 specific implementations
        this._useNewDisplayManager = false;
        this._useNewBackgroundManager = false;
        this._usePortalAPI = false;
    }

    _getDisplayManager() {
        if (this._useNewDisplayManager) {
            return new DisplayManager.DisplayManager();
        } else {
            return Meta.MonitorManager.get();
        }
    }

    _getBackgroundManager() {
        if (this._useNewBackgroundManager) {
            return new Background.BackgroundManager();
        } else {
            return Main.layoutManager._backgroundGroup;
        }
    }

    // Version-specific method for handling screen dimming
    _setScreenDimming(level) {
        if (GNOME_VERSION >= 46) {
            // New API in GNOME 46+
            this._setBrightnessLevel(level);
        } else {
            // Legacy method for GNOME 45
            this._setLegacyBrightnessLevel(level);
        }
    }

    // Version-specific method for handling window dimming
    _setWindowDimming(window, level) {
        if (GNOME_VERSION >= 47) {
            // New window effects API in GNOME 47
            this._setWindowEffectLevel(window, level);
        } else {
            // Legacy method for GNOME 45/46
            this._setLegacyWindowDimLevel(window, level);
        }
    }

    // Version-specific method for pixel shifting
    _applyPixelShift(offset) {
        if (GNOME_VERSION >= 46) {
            // New transformation API in GNOME 46+
            this._applyNewTransformation(offset);
        } else {
            // Legacy transformation for GNOME 45
            this._applyLegacyTransformation(offset);
        }
    }

    // Version-specific cleanup
    cleanup() {
        if (GNOME_VERSION >= 46) {
            this._cleanupNewAPI();
        } else {
            this._cleanupLegacy();
        }
    }

    enable() {
        this._indicator = new OledCareIndicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }

    _setBrightnessLevel(level) {
        this._lastBrightnessMethod = 'new';
        if (Shell.WindowTracker.get_default().focus_app?.is_on_wayland()) {
            this._lastBrightnessMethod = 'new-wayland';
            if (this._usePortalAPI) {
                this._lastBrightnessMethod = 'portal';
                // Use portal API for Wayland windows
                const portal = Shell.Screenshot.getPortalProxy();
                portal.SetBrightnessRemote(level / 100.0);
            } else {
                // Use Wayland-specific brightness API
                Main.layoutManager.monitors.forEach(monitor => {
                    monitor.brightness = level / 100.0;
                });
            }
        } else {
            // Use X11 brightness API
            const brightness = new Gio.Settings({
                schema: 'org.gnome.settings-daemon.plugins.power'
            });
            brightness.set_int('screen-brightness', level);
        }
    }

    _setLegacyBrightnessLevel(level) {
        this._lastBrightnessMethod = 'legacy';
        if (Shell.WindowTracker.get_default().focus_app?.is_on_wayland()) {
            this._lastBrightnessMethod = 'legacy-wayland';
            // Legacy Wayland brightness control
            Main.layoutManager.monitors.forEach(monitor => {
                let actor = monitor.actor;
                let effect = new Clutter.BrightnessContrastEffect();
                actor.add_effect(effect);
                effect.set_brightness(level / 100.0);
            });
        } else {
            // Legacy X11 brightness control
            const proxy = Meta.MonitorManager.get();
            proxy.set_power_save_mode(level < 50 ? 1 : 0);
        }
    }

    _setWindowEffectLevel(window, level) {
        this._lastWindowEffectMethod = 'new';
        if (window.meta_window?.is_wayland_client()) {
            this._lastWindowEffectMethod = this._usePortalAPI ? 'portal-wayland' : 'new-wayland';
            if (this._usePortalAPI) {
                // Use portal API for Wayland window effects
                const portal = Shell.Screenshot.getPortalProxy();
                portal.SetWindowEffectsRemote(window.meta_window.get_id(), {
                    brightness: level / 100.0
                });
            } else {
                // Use new Wayland window effects API
                const actor = window.meta_window.get_compositor_private();
                const effect = new Clutter.BrightnessContrastEffect();
                actor.add_effect(effect);
                effect.set_brightness(level / 100.0);
            }
        } else {
            // Use X11 window effects
            const actor = window.meta_window.get_compositor_private();
            const effect = new Meta.BrightnessContrastEffect();
            actor.add_effect(effect);
            effect.set_brightness(level / 100.0);
        }
    }

    _setLegacyWindowDimLevel(window, level) {
        this._lastWindowEffectMethod = 'legacy';
        if (window.meta_window?.is_wayland_client()) {
            this._lastWindowEffectMethod = 'legacy-wayland';
            // Legacy Wayland window dimming
            const actor = window.meta_window.get_compositor_private();
            const effect = new Clutter.BrightnessContrastEffect();
            actor.add_effect(effect);
            effect.set_brightness(level / -100.0);
        } else {
            // Legacy X11 window dimming
            const actor = window.meta_window.get_compositor_private();
            const effect = new Clutter.BrightnessContrastEffect();
            actor.add_effect(effect);
            effect.set_brightness(level / -100.0);
        }
    }

    _applyNewTransformation(offset) {
        this._lastTransformationMethod = 'new';
        if (Shell.WindowTracker.get_default().focus_app?.is_on_wayland()) {
            this._lastTransformationMethod = this._usePortalAPI ? 'portal-wayland' : 'new-wayland';
            if (this._usePortalAPI) {
                // Use portal API for Wayland transformations
                const portal = Shell.Screenshot.getPortalProxy();
                portal.SetScreenTransformationRemote({
                    x_offset: offset.x,
                    y_offset: offset.y
                });
            } else {
                // Use new Wayland transformation API
                Main.layoutManager.monitors.forEach(monitor => {
                    const actor = monitor.actor;
                    actor.set_translation(offset.x, offset.y, 0);
                });
            }
        } else {
            // Use X11 transformation
            Main.layoutManager.monitors.forEach(monitor => {
                const actor = monitor.actor;
                actor.set_position(offset.x, offset.y);
            });
        }
    }

    _applyLegacyTransformation(offset) {
        this._lastTransformationMethod = 'legacy';
        if (Shell.WindowTracker.get_default().focus_app?.is_on_wayland()) {
            this._lastTransformationMethod = 'legacy-wayland';
            // Legacy Wayland transformation
            Main.layoutManager.monitors.forEach(monitor => {
                const actor = monitor.actor;
                actor.ease({
                    x: offset.x,
                    y: offset.y,
                    duration: 100,
                    mode: Clutter.AnimationMode.LINEAR
                });
            });
        } else {
            // Legacy X11 transformation
            Main.layoutManager.monitors.forEach(monitor => {
                const actor = monitor.actor;
                actor.set_position(offset.x, offset.y);
            });
        }
    }

    _cleanupNewAPI() {
        if (this._usePortalAPI) {
            // Cleanup portal API resources
            const portal = Shell.Screenshot.getPortalProxy();
            portal.ResetRemote();
        }
        // Cleanup new API resources
        Main.layoutManager.monitors.forEach(monitor => {
            const actor = monitor.actor;
            actor.remove_all_effects();
            actor.set_translation(0, 0, 0);
        });
    }

    _cleanupLegacy() {
        // Cleanup legacy resources
        Main.layoutManager.monitors.forEach(monitor => {
            const actor = monitor.actor;
            actor.remove_all_effects();
            actor.set_position(0, 0);
        });
    }

    _initScreenProtection() {
        if (this._usePortalAPI) {
            this._lastScreenProtectionMethod = 'portal';
            // Use portal API for screen recording protection
            const portal = Shell.Screenshot.getPortalProxy();
            portal.SetScreenProtectionRemote(true);
        }
    }
}

function init(meta) {
    return new Extension(meta.uuid);
} 