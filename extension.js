'use strict';

// Initialize system libraries first
const { GLib } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

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

// Get extension after logging is set up
const Me = ExtensionUtils.getCurrentExtension();

// Import extension modules
let OledCareIndicator;
try {
    ({ OledCareIndicator } = Me.imports.lib.indicator);
    _log('Successfully imported OledCareIndicator');
} catch (error) {
    _logError(error);
}

var Extension = class Extension {
    constructor() {
        _log('Constructing extension');
        this._indicator = null;
    }

    enable() {
        _log('Enabling extension');
        try {
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
}; 