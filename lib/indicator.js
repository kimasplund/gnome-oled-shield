'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// Extension imports
import {ExtensionUtils} from './extensionUtils.js';

// Import extension modules
import DisplayManager from './displayManager.js';
import PixelShift from './pixelShift.js';
import Dimming from './dimming.js';
import PixelRefresh from './pixelRefresh.js';

// Add logging function
function _log(message) {
    if (ExtensionUtils.getSettings().get_boolean('debug-mode')) {
        log(`[OledCareIndicator] ${message}`);
    }
}

export default GObject.registerClass({
    GTypeName: 'OledCareIndicator'
},
class OledCareIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'OLED Care Indicator');

        this._extension = extension;
        this._settings = extension.getSettings();
        this._sessionMode = Main.sessionMode;
        this._menuItems = {};  // Initialize menu items container early
        
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

        try {
            this._buildMenu();
            this._bindSettings();
        } catch (error) {
            this._log(`Error building menu: ${error.message}`);
            this._showNotification('Error', 'Failed to build extension menu');
        }

        // Initialize features
        this._log('Initializing features...');
        try {
            this._displayManager.init();
            this._pixelShift.init();
            this._dimming.init();
            this._pixelRefresh.init();
            this._log('Features initialized');
        } catch (error) {
            this._log(`Error initializing features: ${error.message}`);
            this._showNotification('Error', 'Failed to initialize some features');
        }

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
            'screen-dim-enabled',
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

    _buildMenu() {
        this._log('Building menu');
        
        // Header
        let headerItem = new PopupMenu.PopupMenuItem('OLED Care', { 
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
                this._displayManager.showDisplaySelector();
            } catch (error) {
                this._logError('Failed to show display selector: ' + error.message);
                this._showNotification('Failed to show display selector', 'error');
            }
        });
        this.menu.addMenuItem(displayItem);
        
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Pixel Shift toggle
        this._menuItems.pixelShift = new PopupMenu.PopupSwitchMenuItem('Pixel Shift');
        this._menuItems.pixelShift.setToggleState(this._settings.get_boolean('pixel-shift-enabled'));
        this._menuItems.pixelShift.connect('toggled', (item) => {
            this._settings.set_boolean('pixel-shift-enabled', item.state);
        });
        this.menu.addMenuItem(this._menuItems.pixelShift);
        
        // Screen Dimming toggle
        this._menuItems.screenDim = new PopupMenu.PopupSwitchMenuItem('Screen Dimming');
        this._menuItems.screenDim.setToggleState(this._settings.get_boolean('screen-dim-enabled'));
        this._menuItems.screenDim.connect('toggled', (item) => {
            this._settings.set_boolean('screen-dim-enabled', item.state);
        });
        this.menu.addMenuItem(this._menuItems.screenDim);
        
        // Window Dimming toggle
        this._menuItems.windowDim = new PopupMenu.PopupSwitchMenuItem('Window Dimming');
        this._menuItems.windowDim.setToggleState(this._settings.get_boolean('unfocus-dim-enabled'));
        this._menuItems.windowDim.connect('toggled', (item) => {
            this._settings.set_boolean('unfocus-dim-enabled', item.state);
        });
        this.menu.addMenuItem(this._menuItems.windowDim);
        
        // Pixel Refresh toggle
        this._menuItems.pixelRefresh = new PopupMenu.PopupSwitchMenuItem('Pixel Refresh');
        this._menuItems.pixelRefresh.setToggleState(this._settings.get_boolean('pixel-refresh-enabled'));
        this._menuItems.pixelRefresh.connect('toggled', (item) => {
            this._settings.set_boolean('pixel-refresh-enabled', item.state);
        });
        this.menu.addMenuItem(this._menuItems.pixelRefresh);
        
        // Manual Pixel Refresh
        this._menuItems.manualRefresh = new PopupMenu.PopupMenuItem('Run Pixel Refresh Now');
        this._menuItems.manualRefresh.setSensitive(!this._settings.get_boolean('pixel-refresh-running'));
        this._menuItems.manualRefresh.connect('activate', () => {
            this._pixelRefresh.runManualRefresh();
        });
        this.menu.addMenuItem(this._menuItems.manualRefresh);
        
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Settings button
        let settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(settingsItem);
        
        this._log('Menu built');
    }
    
    _bindSettings() {
        this._log('Binding settings');
        
        // Bind pixel shift settings
        this._settings.bind('pixel-shift-enabled', this._pixelShift, 'enabled', Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect('changed::pixel-shift-enabled', () => {
            if (this._menuItems.pixelShift) {
                this._menuItems.pixelShift.setToggleState(this._settings.get_boolean('pixel-shift-enabled'));
            }
        });
        
        // Bind dimming settings
        this._settings.bind('screen-dim-enabled', this._dimming, 'enabled', Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect('changed::screen-dim-enabled', () => {
            if (this._menuItems.screenDim) {
                this._menuItems.screenDim.setToggleState(this._settings.get_boolean('screen-dim-enabled'));
            }
        });
        
        this._settings.bind('unfocus-dim-enabled', this._dimming, 'unfocusEnabled', Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect('changed::unfocus-dim-enabled', () => {
            if (this._menuItems.windowDim) {
                this._menuItems.windowDim.setToggleState(this._settings.get_boolean('unfocus-dim-enabled'));
            }
        });
        
        // Bind pixel refresh settings
        this._settings.bind('pixel-refresh-enabled', this._pixelRefresh, 'enabled', Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect('changed::pixel-refresh-enabled', () => {
            if (this._menuItems.pixelRefresh) {
                this._menuItems.pixelRefresh.setToggleState(this._settings.get_boolean('pixel-refresh-enabled'));
            }
        });
        
        // Update manual refresh item sensitivity based on pixel refresh running state
        this._settings.connect('changed::pixel-refresh-running', () => {
            if (this._menuItems.manualRefresh) {
                this._menuItems.manualRefresh.setSensitive(!this._settings.get_boolean('pixel-refresh-running'));
            }
        });
        
        // Bind other settings as before...
        this._settings.bind('pixel-shift-interval', this._pixelShift, 'interval', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('dimming-level', this._dimming, 'level', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('screen-dim-timeout', this._dimming, 'timeout', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('unfocus-dim-level', this._dimming, 'unfocusLevel', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('pixel-refresh-speed', this._pixelRefresh, 'speed', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('pixel-refresh-smart', this._pixelRefresh, 'smart', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('pixel-refresh-schedule', this._pixelRefresh, 'schedule', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('enabled-displays', this._displayManager, 'enabledDisplays', Gio.SettingsBindFlags.DEFAULT);
        
        this._log('Settings bound');
    }
    
    _showNotification(title, message) {
        try {
            if (!this._notificationSource || !Main.messageTray) {
                this._log('Warning: Notification system not available');
                return;
            }
            
            let notification = new MessageTray.Notification({
                source: this._notificationSource,
                title: title,
                body: message,
                isTransient: true
            });

            try {
                this._notificationSource.showNotification(notification);
                this._log(`Notification shown: ${title} - ${message}`);
            } catch (showError) {
                this._log(`Failed to show notification: ${showError.message}`);
            }
        } catch (error) {
            this._log(`Error creating notification: ${error.message}`);
        }
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