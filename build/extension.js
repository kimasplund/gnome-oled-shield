'use strict';

// GNOME imports
const { GLib } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// Initialize logging
function _log(message) {
    log(`[OLED Care] ${message}`);
}

function _logError(error) {
    log(`[OLED Care] ERROR: ${error.message}`);
    if (error.stack) {
        log(`[OLED Care] Stack trace:\n${error.stack}`);
    }
}

// Import extension modules
let OledCareIndicator = null;

function init() {
    ExtensionUtils.initTranslations();
    return new Extension();
}

class Extension {
    constructor() {
        _log('Constructing extension');
        this._indicator = null;
    }

    enable() {
        _log('Enabling extension');
        try {
            // Import indicator the first time 
            if (!OledCareIndicator) {
                try {
                    ({ OledCareIndicator } = Me.imports.lib.indicator);
                    _log('Successfully imported OledCareIndicator');
                } catch (error) {
                    _logError(error);
                    return;
                }
            }
            
            // Only create indicator if we're in an allowed session mode
            if (Main.sessionMode.allowExtensions) {
                _log('Session mode allows extensions');
                this._indicator = new OledCareIndicator();
                Main.panel.addToStatusArea(Me.metadata.uuid, this._indicator);
                _log('Indicator added to panel');
            } else {
                _log('Extensions not allowed in current session mode');
            }
        } catch (error) {
            _logError(error);
        }
    }

    disable() {
        _log('Disabling extension');
        try {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
                _log('Indicator destroyed');
            }
        } catch (error) {
            _logError(error);
        }
    }
} 