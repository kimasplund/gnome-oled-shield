'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Import modules conditionally based on environment
const isTestEnv = GLib.getenv('G_TEST_SRCDIR') !== null;

const Main = isTestEnv 
    ? (await import('./tests/unit/mocks/main.js')).Main 
    : (await import('resource:///org/gnome/shell/ui/main.js')).Main;

import { Dimming } from './lib/dimming.js';

export const Extension = GObject.registerClass(
    class Extension extends GObject.Object {
        constructor() {
            super();
            this._dimming = null;
            this._settings = null;
            this._settingsChangedId = null;
        }

        enable() {
            this._settings = this.getSettings();
            this._dimming = new Dimming(this._settings);
            this._settingsChangedId = this._settings.connect('changed', this._onSettingsChanged.bind(this));
            this._onSettingsChanged();
        }

        disable() {
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

        getSettings() {
            const schemaDir = this.path ? GLib.build_filenamev([this.path, 'schemas']) : null;
            let schemaSource;
            
            if (schemaDir && GLib.file_test(schemaDir, GLib.FileTest.IS_DIR)) {
                schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                    schemaDir,
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
            } else {
                schemaSource = Gio.SettingsSchemaSource.get_default();
            }

            const schema = schemaSource.lookup('org.gnome.shell.extensions.oled-dimming', true);
            return new Gio.Settings({ settings_schema: schema });
        }
    }
); 