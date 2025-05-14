'use strict';

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import { Settings, SettingsBindFlags } from './gio.js';
import { PreferencesPage } from './adw.js';

// Mock ExtensionPreferences base class
export const ExtensionPreferences = GObject.registerClass({
    GTypeName: 'TestExtensionPreferences',
    Properties: {
        'path': GObject.ParamSpec.string(
            'path',
            'Path',
            'Extension path',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'metadata': GObject.ParamSpec.object(
            'metadata',
            'Metadata',
            'Extension metadata',
            GObject.ParamFlags.READWRITE,
            GObject.Object
        ),
    },
}, class ExtensionPreferences extends GObject.Object {
    constructor() {
        super();
        this.path = null;
        this.metadata = null;
        this._settings = null;
    }

    getSettings() {
        if (!this._settings) {
            this._settings = new Settings();
        }
        return this._settings;
    }

    fillPreferencesWindow(window) {
        // Create a basic page
        const page = new PreferencesPage();
        window.add(page);
        return window;
    }

    // Mock the ExtensionPreferences API
    _init() {
        super._init();
    }

    _getDefaultGioSettings() {
        return this.getSettings();
    }

    _onDestroy() {
        if (this._settings) {
            this._settings = null;
        }
    }

    // Utility methods
    lookup_schema(schema) {
        return null;
    }

    get_schema_id() {
        return 'org.gnome.shell.extensions.oled-dimming';
    }

    get_schema_path() {
        return '/org/gnome/shell/extensions/oled-dimming/';
    }
}); 