'use strict';

import GObject from 'gi://GObject';

/**
 * Mock Main module for GNOME Shell extension testing
 * Provides mock implementations of GNOME Shell's Main module components
 */
export const Main = {
    // Notification system
    notify: (title, body) => {
        console.log(`[MOCK] Notification: ${title} - ${body}`);
        return true;
    },
    
    // Window management 
    wm: {
        _keybindings: new Map(),
        
        /**
         * Add a keybinding
         * @param {string} name - Keybinding name
         * @param {Object} settings - Settings object
         * @param {number} flags - Keybinding flags
         * @param {number} mode - Keybinding mode
         * @param {Function} handler - Callback handler
         * @returns {number} Binding ID
         */
        addKeybinding(name, settings, flags, mode, handler) {
            const id = Date.now();
            this._keybindings.set(id, { name, handler });
            return id;
        },
        
        /**
         * Remove a keybinding
         * @param {string} name - Keybinding name to remove
         * @returns {boolean} Whether removal was successful
         */
        removeKeybinding(name) {
            for (const [id, binding] of this._keybindings.entries()) {
                if (binding.name === name) {
                    this._keybindings.delete(id);
                    return true;
                }
            }
            return false;
        }
    },
    
    // Overview management
    overview: {
        _visible: false,
        
        /**
         * Hide the overview
         * @returns {boolean} Success
         */
        hide() {
            this._visible = false;
            return true;
        },
        
        /**
         * Show the overview
         * @returns {boolean} Success
         */
        show() {
            this._visible = true;
            return true;
        },
        
        /**
         * Toggle the overview visibility
         * @returns {boolean} New visibility state
         */
        toggle() {
            this._visible = !this._visible;
            return this._visible;
        },
        
        /**
         * Check if overview is visible
         * @returns {boolean} Visibility state
         */
        get visible() {
            return this._visible;
        }
    },
    
    // Session mode
    sessionMode: (() => {
        const obj = GObject.registerClass({
            Signals: { 'updated': {} },
            Properties: {
                'currentMode': GObject.ParamSpec.string(
                    'currentMode', 
                    'Current Mode', 
                    'Current session mode',
                    GObject.ParamFlags.READWRITE,
                    'user'
                ),
                'isLocked': GObject.ParamSpec.boolean(
                    'isLocked',
                    'Is Locked',
                    'Whether the session is locked',
                    GObject.ParamFlags.READWRITE,
                    false
                )
            }
        }, class SessionMode extends GObject.Object {
            #currentMode = 'user';
            #isLocked = false;
            
            get currentMode() {
                return this.#currentMode;
            }
            
            set currentMode(mode) {
                if (this.#currentMode !== mode) {
                    this.#currentMode = mode;
                    this.#isLocked = mode === 'unlock-dialog';
                    this.notify('currentMode');
                    this.notify('isLocked');
                    this.emit('updated');
                }
            }
            
            get isLocked() {
                return this.#isLocked;
            }
            
            set isLocked(locked) {
                if (this.#isLocked !== locked) {
                    this.#isLocked = locked;
                    this.#currentMode = locked ? 'unlock-dialog' : 'user';
                    this.notify('isLocked');
                    this.notify('currentMode');
                    this.emit('updated');
                }
            }
        });
        
        return new obj();
    })(),
    
    // Layout management
    layoutManager: {
        _monitors: [
            {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                index: 0,
                geometry: { x: 0, y: 0, width: 1920, height: 1080 },
                inFullscreen: false,
                scale: 1
            }
        ],
        
        /**
         * Get all monitors
         */
        get monitors() {
            return [...this._monitors];
        },
        
        /**
         * Get primary monitor
         */
        get primaryMonitor() {
            return this._monitors[0];
        },
        
        /**
         * Add a mock monitor
         * @param {Object} monitor - Monitor configuration
         */
        addMonitor(monitor) {
            const newMonitor = {
                x: monitor.x ?? 0,
                y: monitor.y ?? 0,
                width: monitor.width ?? 1920,
                height: monitor.height ?? 1080,
                index: this._monitors.length,
                geometry: { 
                    x: monitor.x ?? 0, 
                    y: monitor.y ?? 0, 
                    width: monitor.width ?? 1920, 
                    height: monitor.height ?? 1080 
                },
                inFullscreen: monitor.inFullscreen ?? false,
                scale: monitor.scale ?? 1
            };
            
            this._monitors.push(newMonitor);
            return newMonitor;
        }
    },
    
    // Message tray for notifications
    messageTray: (() => {
        const obj = GObject.registerClass({
            Signals: { 'source-added': {}, 'source-removed': {} }
        }, class MessageTray extends GObject.Object {
            #sources = new Set();
            
            /**
             * Add a notification source
             * @param {Object} source - Notification source
             */
            add(source) {
                if (source) {
                    this.#sources.add(source);
                    console.log('[MOCK] Added notification source:', source?.title ?? 'unknown');
                    this.emit('source-added', source);
                    return true;
                }
                return false;
            }
            
            /**
             * Remove a notification source
             * @param {Object} source - Notification source
             */
            remove(source) {
                if (this.#sources.has(source)) {
                    this.#sources.delete(source);
                    this.emit('source-removed', source);
                    return true;
                }
                return false;
            }
            
            /**
             * Get all sources
             */
            get sources() {
                return [...this.#sources];
            }
        });
        
        return new obj();
    })()
}; 