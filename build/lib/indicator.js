'use strict';

// Initialize logging early
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// Add logging function
function _log(message) {
    if (ExtensionUtils.getSettings().get_boolean('debug-mode')) {
        log(`[OledCareIndicator] ${message}`);
    }
}

// GObject imports
const { GObject, St, GLib } = imports.gi;

// GNOME Shell imports
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;

// Extension imports
const { DisplayManager } = Me.imports.lib.displayManager;
const { PixelShift } = Me.imports.lib.pixelShift;
const { Dimming } = Me.imports.lib.dimming;
const { PixelRefresh } = Me.imports.lib.pixelRefresh;

var OledCareIndicator = GObject.registerClass(
class OledCareIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'OLED Care Indicator');

        this._settings = ExtensionUtils.getSettings();
        this._sessionMode = Main.sessionMode;
        
        // Validate settings
        this._validateSettings();

        // Initialize managers
        this._displayManager = new DisplayManager(this._settings);
        this._pixelShift = new PixelShift(this._settings);
        this._dimming = new Dimming(this._settings);
        this._pixelRefresh = new PixelRefresh(this._settings);

        // Create notification source
        this._notificationSource = new MessageTray.Source({
            title: 'OLED Care',
            iconName: 'oled-care-symbolic'
        });
        Main.messageTray.add(this._notificationSource);

        // Create the panel icon
        let icon = new St.Icon({
            icon_name: 'oled-care-symbolic',
            style_class: 'system-status-icon'
        });
        this.add_child(icon);

        this._buildMenu();
        this._bindSettings();

        // Initialize features
        this._log('Initializing features...');
        this._displayManager.init();
        this._pixelShift.init();
        this._dimming.init();
        this._pixelRefresh.init();
        this._log('Features initialized');

        // Connect to session mode changes
        this._sessionModeChangedId = this._sessionMode.connect('updated', 
            this._onSessionModeChanged.bind(this));

        // Show welcome notification only in user mode
        if (this._sessionMode.currentMode === 'user') {
            this._showNotification('OLED Care Active', 'Protecting your OLED display');
        }

        this._log('Indicator initialization complete');
    }

    _validateSettings() {
        const requiredSettings = [
            'debug-mode',
            'enabled-displays',
            'display-brightness',
            'display-contrast',
            'dimming-level',
            'screen-dim-timeout',
            'unfocus-dim-enabled',
            'unfocus-dim-level',
            'pixel-shift-enabled',
            'pixel-shift-interval',
            'pixel-refresh-enabled',
            'pixel-refresh-speed',
            'pixel-refresh-smart',
            'pixel-refresh-schedule',
            'pixel-refresh-running',
            'pixel-refresh-progress',
            'pixel-refresh-time-remaining',
            'pixel-refresh-next-run',
            'pixel-refresh-manual-trigger',
            'pixel-refresh-manual-cancel'
        ];

        const schemas = this._settings.list_keys();
        for (const setting of requiredSettings) {
            if (!schemas.includes(setting)) {
                this._log(`Warning: Required setting '${setting}' not found in schema`);
            }
        }
    }

    _onSessionModeChanged() {
        const mode = this._sessionMode.currentMode;
        this._log(`Session mode changed to: ${mode}`);
        
        switch (mode) {
            case 'user':
                this._enableFullFunctionality();
                break;
            case 'unlock-dialog':
                this._enableLimitedFunctionality();
                break;
            default:
                this._disableFeatures();
                break;
        }
    }

    _enableFullFunctionality() {
        this._log('Enabling full functionality');
        this.show();
        this.menu.enable();
        this._displayManager.enable();
        this._pixelShift.enable();
        this._dimming.enable();
        this._pixelRefresh.enable();
    }

    _enableLimitedFunctionality() {
        this._log('Enabling limited functionality');
        this.hide();
        this.menu.disable();
        this._displayManager.enableLimited();
        this._pixelShift.enable();
        this._dimming.enableLimited();
        this._pixelRefresh.disable();
    }

    _disableFeatures() {
        this._log('Disabling all features');
        this.hide();
        this.menu.disable();
        this._displayManager.disable();
        this._pixelShift.disable();
        this._dimming.disable();
        this._pixelRefresh.disable();
    }

    destroy() {
        this._log('Destroying indicator');
        if (this._sessionModeChangedId) {
            this._sessionMode.disconnect(this._sessionModeChangedId);
            this._sessionModeChangedId = null;
        }

        this._displayManager.destroy();
        this._pixelShift.destroy();
        this._dimming.destroy();
        this._pixelRefresh.destroy();

        if (this._notificationSource) {
            this._notificationSource.destroy();
            this._notificationSource = null;
        }

        super.destroy();
        this._log('Indicator destroyed');
    }
}); 