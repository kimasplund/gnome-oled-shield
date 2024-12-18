'use strict';

const { GObject, Gio, Meta, Shell, Clutter, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PIXEL_SHIFT_AMOUNT = 1; // pixels to shift

const OledCareIndicator = GObject.registerClass(
class OledCareIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'OLED Care Indicator');

        this._settings = ExtensionUtils.getSettings();
        this._sessionMode = Main.sessionMode;
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
        this._setupMonitors();
        this._setupIdleWatch();
        this._setupWindowTracker();
        this._setupAutoHide();
        this._setupPixelRefresh();

        // Connect to session mode changes
        this._sessionModeChangedId = this._sessionMode.connect('updated', 
            this._onSessionModeChanged.bind(this));

        // Show welcome notification only in user mode
        if (this._sessionMode.currentMode === 'user') {
            this._showNotification('OLED Care Active', 'Protecting your OLED display');
        }
    }

    _onSessionModeChanged() {
        const mode = this._sessionMode.currentMode;
        
        // Handle different session modes
        switch (mode) {
            case 'user':
                // Full functionality in user mode
                this._enableFullFunctionality();
                break;
            case 'unlock-dialog':
                // Limited functionality in unlock dialog
                this._enableLimitedFunctionality();
                break;
            default:
                // Disable most features in other modes
                this._disableFeatures();
                break;
        }
    }

    _enableFullFunctionality() {
        // Enable all features
        this.show();
        this.menu.enable();
        this._setupMonitors();
        this._setupIdleWatch();
        this._setupWindowTracker();
        this._setupAutoHide();
        this._setupPixelRefresh();
    }

    _enableLimitedFunctionality() {
        // Limited functionality for lock screen
        this.hide();
        this.menu.disable();
        this._setupMonitors();
        this._setupIdleWatch();
        // Disable window tracking and auto-hide in lock screen
        this._removeWindowTracker();
        this._removeAutoHide();
        this._removePixelRefresh();
    }

    _disableFeatures() {
        // Disable most features
        this.hide();
        this.menu.disable();
        this._removeMonitors();
        this._removeIdleWatch();
        this._removeWindowTracker();
        this._removeAutoHide();
        this._removePixelRefresh();
    }

    destroy() {
        if (this._sessionModeChangedId) {
            this._sessionMode.disconnect(this._sessionModeChangedId);
            this._sessionModeChangedId = null;
        }

        if (this._notificationSource) {
            this._notificationSource.destroy();
            this._notificationSource = null;
        }

        super.destroy();
    }

    // ... rest of the class implementation ...
});

export default class Extension {
    enable() {
        // Only create indicator if we're in an allowed session mode
        if (Main.sessionMode.allowExtensions) {
            this._indicator = new OledCareIndicator();
            Main.panel.addToStatusArea(Me.metadata.uuid, this._indicator);
        }
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
} 