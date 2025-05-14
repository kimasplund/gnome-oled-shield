// GNOME Shell X11 monitor configuration
import Meta from 'gi://Meta';

/**
 * Configure X11 monitor settings
 */
export function configureMonitor(display) {
    const monitorManager = display.get_monitor_manager();
    
    // Default monitor configuration
    const defaultConfig = {
        connector: 'HDMI-1',
        display_name: 'Test Display',
        is_primary: true,
        is_presentation: false,
        is_underscanning: false,
        supported_scales: [1],
        preferred_scale: 1,
        geometry: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        properties: {
            'Composite': true,
            'DPMS': true,
        },
        transform: Meta.MonitorTransform.NORMAL,
    };

    // Set monitor configuration
    monitorManager.set_display_configuration([defaultConfig]);

    return {
        addMonitor(config) {
            const monitors = monitorManager.get_display_configuration();
            monitors.push({ ...defaultConfig, ...config });
            monitorManager.set_display_configuration(monitors);
        },

        removeMonitor(connector) {
            const monitors = monitorManager.get_display_configuration()
                .filter(m => m.connector !== connector);
            monitorManager.set_display_configuration(monitors);
        },

        updateMonitor(connector, config) {
            const monitors = monitorManager.get_display_configuration()
                .map(m => m.connector === connector ? { ...m, ...config } : m);
            monitorManager.set_display_configuration(monitors);
        },

        // X11 specific monitor features
        setCompositing(enabled) {
            display.set_compositor_enabled(enabled);
        },

        setCursorTheme(theme, size) {
            display.set_cursor_theme(theme, size);
        },
    };
} 