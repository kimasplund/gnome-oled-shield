'use strict';

import GObject from 'gi://GObject';

// Mock Meta.WindowActor
export const WindowActor = GObject.registerClass(
    class WindowActor extends GObject.Object {
        constructor() {
            super();
            this._effects = new Map();
        }

        add_effect(effect) {
            this._effects.set(effect.name, effect);
            effect.set_enabled(true);
        }

        remove_effect(name) {
            const effect = this._effects.get(name);
            if (effect) {
                effect.set_enabled(false);
                this._effects.delete(name);
            }
        }

        get_effect(name) {
            const effect = this._effects.get(name);
            return effect && effect.get_enabled() ? effect : null;
        }
    }
);

// Mock Meta.Window
export const Window = GObject.registerClass(
    class Window extends GObject.Object {
        constructor(params = {}) {
            super();
            this._focus = params.focus || false;
        }

        has_focus() {
            return this._focus;
        }

        get_compositor_private() {
            return new WindowActor({ meta_window: this });
        }
    }
);

// Mock Meta.Display
export const Display = GObject.registerClass(
    class Display extends GObject.Object {
        constructor() {
            super();
            this.focus_window = null;
        }

        get_workspace_manager() {
            return {
                get_active_workspace: () => ({
                    list_windows: () => []
                })
            };
        }
    }
);

// Mock Meta.IdleMonitor
export const IdleMonitor = {
    get_core: () => ({
        get_idletime: () => 0
    })
}; 