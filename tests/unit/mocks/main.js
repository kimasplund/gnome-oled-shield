'use strict';

import GObject from 'gi://GObject';

// Mock Main module
export const Main = {
    notify: (title, body) => {},
    wm: {
        addKeybinding: (name, settings, flags, mode, handler) => {},
        removeKeybinding: (name) => {}
    },
    overview: {
        hide: () => {},
        show: () => {},
        toggle: () => {}
    },
    sessionMode: {
        isLocked: false
    },
    layoutManager: {
        monitors: [
            {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080
            }
        ]
    },
    messageTray: {
        add: (source) => {
            console.log('Added notification source:', source);
        }
    }
}; 