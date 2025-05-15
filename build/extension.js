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
    ? (await import('./tests/unit/mocks/main.js')).Main 
    : (await import('resource:///org/gnome/shell/ui/main.js')).Main;

import { Extension as BaseExtension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Dimming from './lib/dimming.js';

export default class OledCareExtension extends BaseExtension {
    constructor(metadata) {
        super(metadata);
        this._dimming = null;
        this._settings = null;
        this._settingsChangedId = null;
        this._indicator = null;
    }

    enable() {
        this._settings = this.getSettings();
        this._dimming = new Dimming(this._settings);
        this._settingsChangedId = this._settings.connect('changed', this._onSettingsChanged.bind(this));
        
        // Create indicator
        this._indicator = new PanelMenu.Button(0.0, 'OLED Care', false);
        const icon = new St.Icon({
            icon_name: 'oled-care-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);
        
        // Add menu items
        const menu = this._indicator.menu;
        const dimItem = new PopupMenu.PopupSwitchMenuItem('Screen Dimming', 
            this._settings.get_boolean('screen-dim-enabled'));
        
        dimItem.connect('toggled', (item) => {
            this._settings.set_boolean('screen-dim-enabled', item.state);
        });
        
        menu.addMenuItem(dimItem);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        const settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            this.openPreferences();
        });
        
        menu.addMenuItem(settingsItem);
        
        // Add to panel
        Main.panel.addToStatusArea('oled-care', this._indicator);
        
        this._onSettingsChanged();
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._dimming) {
            this._dimming.destroy();
            this._dimming = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._settings = null;
    }

    _onSettingsChanged() {
        if (this._dimming) {
            this._dimming.applyDimming();
        }
    }

    // Using parent class's getSettings() method which correctly uses the extension metadata
    // to determine the schema ID
} 