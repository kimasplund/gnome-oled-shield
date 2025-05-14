// GNOME Shell X11 input configuration
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Configure X11 input settings
 */
export function configureInput(backend) {
    // Default input settings
    const defaultSettings = {
        mouse_accel_profile: Meta.MouseAccelProfile.DEFAULT,
        mouse_accel: true,
        mouse_speed: 0,
        mouse_natural_scroll: false,
    };

    // Set input settings
    backend.set_input_settings(defaultSettings);

    return {
        simulateKeyPress(keyval, flags = 0) {
            const event = Clutter.Event.new(Clutter.EventType.KEY_PRESS);
            event.set_flags(flags);
            event.set_key_symbol(keyval);
            event.set_time(global.get_current_time());
            global.stage.event(event);
        },

        simulateKeyRelease(keyval, flags = 0) {
            const event = Clutter.Event.new(Clutter.EventType.KEY_RELEASE);
            event.set_flags(flags);
            event.set_key_symbol(keyval);
            event.set_time(global.get_current_time());
            global.stage.event(event);
        },

        simulateClick(button = 1, x = 0, y = 0) {
            const pressEvent = Clutter.Event.new(Clutter.EventType.BUTTON_PRESS);
            pressEvent.set_coords(x, y);
            pressEvent.set_button(button);
            pressEvent.set_time(global.get_current_time());
            global.stage.event(pressEvent);

            const releaseEvent = Clutter.Event.new(Clutter.EventType.BUTTON_RELEASE);
            releaseEvent.set_coords(x, y);
            releaseEvent.set_button(button);
            releaseEvent.set_time(global.get_current_time());
            global.stage.event(releaseEvent);
        },

        simulateMotion(x, y) {
            const event = Clutter.Event.new(Clutter.EventType.MOTION);
            event.set_coords(x, y);
            event.set_time(global.get_current_time());
            global.stage.event(event);
        },

        // X11 specific input features
        simulateXInput(deviceId, type, detail, flags = 0) {
            const event = Clutter.Event.new(type);
            event.set_flags(flags);
            event.set_device(Main.xdndHandler.getDevice(deviceId));
            event.set_time(global.get_current_time());
            global.stage.event(event);
        },
    };
} 