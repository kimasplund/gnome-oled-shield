// GNOME Shell X11 test environment setup
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as TestUtils from 'resource:///org/gnome/shell/misc/testUtils.js';

import { configureMonitor } from './monitor.js';
import { configureInput } from './input.js';

/**
 * Set up X11 test environment
 */
export function setupTestEnvironment() {
    // Mock X11 display
    global.context = Shell.Global.get();
    global.display = new Meta.Display({
        compositor_type: Meta.CompositorType.X11,
        backend: Meta.Backend.get_backend(),
    });

    // Set up monitor configuration
    const monitor = configureMonitor(global.display);

    // Set up X11 specific features
    monitor.setCompositing(true);
    monitor.setCursorTheme('Adwaita', 24);

    // Set up input configuration
    const input = configureInput(global.backend);

    // Set up stage
    global.stage = global.get_stage();
    global.stage.realize();

    // Set up workspaces
    global.workspace_manager = global.display.get_workspace_manager();
    global.workspace_manager.create_workspace(0, true);

    // Set up X11 root window
    global.root = global.display.get_root_meta_window();
    if (global.root)
        global.root.make_above();

    return {
        monitor,
        input,
        async cleanup() {
            // Clean up root window
            if (global.root) {
                global.root.delete(global.get_current_time());
                global.root = null;
            }

            // Clean up workspaces
            while (global.workspace_manager.get_n_workspaces() > 0)
                global.workspace_manager.remove_workspace(
                    global.workspace_manager.get_workspace_by_index(0),
                    global.get_current_time()
                );

            // Clean up display
            global.display.close();
            global.display = null;

            // Clean up stage
            global.stage.destroy();
            global.stage = null;

            // Clean up context
            global.context = null;

            // Wait for cleanup
            await TestUtils.waitForGarbageCollection();
        }
    };
} 