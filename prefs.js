'use strict';

const { Adw, Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {
}

function fillPreferencesWindow(window) {
    const settings = ExtensionUtils.getSettings();

    // Create a preferences page
    const page = new Adw.PreferencesPage();
    window.add(page);

    // Dimming settings group
    const dimmingGroup = new Adw.PreferencesGroup({
        title: 'Dimming Settings',
        description: 'Configure screen dimming behavior'
    });
    page.add(dimmingGroup);

    // Dimming level
    const dimmingRow = new Adw.ActionRow({
        title: 'Dimming Level',
        subtitle: 'Percentage of brightness reduction (0-50%)'
    });
    const dimmingAdjustment = new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 1,
        page_increment: 10,
        value: settings.get_int('dimming-level')
    });
    const dimmingSpinButton = new Gtk.SpinButton({
        adjustment: dimmingAdjustment,
        climb_rate: 1,
        digits: 0,
        numeric: true,
        valign: Gtk.Align.CENTER
    });
    dimmingRow.add_suffix(dimmingSpinButton);
    dimmingGroup.add(dimmingRow);

    settings.bind(
        'dimming-level',
        dimmingSpinButton,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Screen dim timeout
    const timeoutRow = new Adw.ActionRow({
        title: 'Screen Dim Timeout',
        subtitle: 'Time in seconds before dimming (30-3600)'
    });
    const timeoutAdjustment = new Gtk.Adjustment({
        lower: 30,
        upper: 3600,
        step_increment: 30,
        page_increment: 300,
        value: settings.get_int('screen-dim-timeout')
    });
    const timeoutSpinButton = new Gtk.SpinButton({
        adjustment: timeoutAdjustment,
        climb_rate: 1,
        digits: 0,
        numeric: true,
        valign: Gtk.Align.CENTER
    });
    timeoutRow.add_suffix(timeoutSpinButton);
    dimmingGroup.add(timeoutRow);

    settings.bind(
        'screen-dim-timeout',
        timeoutSpinButton,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Window dimming settings group
    const windowDimGroup = new Adw.PreferencesGroup({
        title: 'Window Dimming Settings',
        description: 'Configure unfocused window dimming behavior'
    });
    page.add(windowDimGroup);

    // Window dim enable switch
    const windowDimRow = new Adw.ActionRow({
        title: 'Enable Window Dimming',
        subtitle: 'Dim unfocused windows to reduce OLED wear'
    });
    const windowDimSwitch = new Gtk.Switch({
        active: settings.get_boolean('unfocus-dim-enabled'),
        valign: Gtk.Align.CENTER
    });
    windowDimRow.add_suffix(windowDimSwitch);
    windowDimGroup.add(windowDimRow);

    settings.bind(
        'unfocus-dim-enabled',
        windowDimSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Window dim level
    const windowDimLevelRow = new Adw.ActionRow({
        title: 'Window Dim Level',
        subtitle: 'Percentage of brightness reduction for unfocused windows (0-40%)'
    });
    const windowDimAdjustment = new Gtk.Adjustment({
        lower: 0,
        upper: 40,
        step_increment: 1,
        page_increment: 5,
        value: settings.get_int('unfocus-dim-level')
    });
    const windowDimSpinButton = new Gtk.SpinButton({
        adjustment: windowDimAdjustment,
        climb_rate: 1,
        digits: 0,
        numeric: true,
        valign: Gtk.Align.CENTER
    });
    windowDimLevelRow.add_suffix(windowDimSpinButton);
    windowDimGroup.add(windowDimLevelRow);

    settings.bind(
        'unfocus-dim-level',
        windowDimSpinButton,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Pixel shift settings group
    const pixelShiftGroup = new Adw.PreferencesGroup({
        title: 'Pixel Shift Settings',
        description: 'Configure pixel shifting behavior'
    });
    page.add(pixelShiftGroup);

    // Pixel shift enable switch
    const pixelShiftRow = new Adw.ActionRow({
        title: 'Enable Pixel Shift',
        subtitle: 'Periodically shift pixels to prevent burn-in'
    });
    const pixelShiftSwitch = new Gtk.Switch({
        active: settings.get_boolean('pixel-shift-enabled'),
        valign: Gtk.Align.CENTER
    });
    pixelShiftRow.add_suffix(pixelShiftSwitch);
    pixelShiftGroup.add(pixelShiftRow);

    settings.bind(
        'pixel-shift-enabled',
        pixelShiftSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Pixel shift interval
    const intervalRow = new Adw.ActionRow({
        title: 'Pixel Shift Interval',
        subtitle: 'Time in seconds between shifts (60-3600)'
    });
    const intervalAdjustment = new Gtk.Adjustment({
        lower: 60,
        upper: 3600,
        step_increment: 60,
        page_increment: 300,
        value: settings.get_int('pixel-shift-interval')
    });
    const intervalSpinButton = new Gtk.SpinButton({
        adjustment: intervalAdjustment,
        climb_rate: 1,
        digits: 0,
        numeric: true,
        valign: Gtk.Align.CENTER
    });
    intervalRow.add_suffix(intervalSpinButton);
    pixelShiftGroup.add(intervalRow);

    settings.bind(
        'pixel-shift-interval',
        intervalSpinButton,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Interface settings group
    const interfaceGroup = new Adw.PreferencesGroup({
        title: 'Interface Settings',
        description: 'Configure interface elements behavior'
    });
    page.add(interfaceGroup);

    // True black background switch
    const blackBgRow = new Adw.ActionRow({
        title: 'True Black Background',
        subtitle: 'Set desktop background to pure black to turn off unused pixels'
    });
    const blackBgSwitch = new Gtk.Switch({
        active: settings.get_boolean('true-black-background'),
        valign: Gtk.Align.CENTER
    });
    blackBgRow.add_suffix(blackBgSwitch);
    interfaceGroup.add(blackBgRow);

    settings.bind(
        'true-black-background',
        blackBgSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Panel auto-hide switch
    const panelHideRow = new Adw.ActionRow({
        title: 'Auto-hide Top Panel',
        subtitle: 'Hide the top panel when not in use'
    });
    const panelHideSwitch = new Gtk.Switch({
        active: settings.get_boolean('autohide-top-panel'),
        valign: Gtk.Align.CENTER
    });
    panelHideRow.add_suffix(panelHideSwitch);
    interfaceGroup.add(panelHideRow);

    settings.bind(
        'autohide-top-panel',
        panelHideSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Dash auto-hide switch
    const dashHideRow = new Adw.ActionRow({
        title: 'Auto-hide Dash',
        subtitle: 'Hide the dash/dock when not in use'
    });
    const dashHideSwitch = new Gtk.Switch({
        active: settings.get_boolean('autohide-dash'),
        valign: Gtk.Align.CENTER
    });
    dashHideRow.add_suffix(dashHideSwitch);
    interfaceGroup.add(dashHideRow);

    settings.bind(
        'autohide-dash',
        dashHideSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Pixel Refresh settings group
    const refreshGroup = new Adw.PreferencesGroup({
        title: 'Pixel Refresh Settings',
        description: 'Configure periodic pixel refresh behavior'
    });
    page.add(refreshGroup);

    // Enable pixel refresh
    const refreshRow = new Adw.ActionRow({
        title: 'Enable Pixel Refresh',
        subtitle: 'Run a white line across the screen periodically to refresh pixels'
    });
    const refreshSwitch = new Gtk.Switch({
        active: settings.get_boolean('pixel-refresh-enabled'),
        valign: Gtk.Align.CENTER
    });
    refreshRow.add_suffix(refreshSwitch);
    refreshGroup.add(refreshRow);

    settings.bind(
        'pixel-refresh-enabled',
        refreshSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Refresh speed
    const speedRow = new Adw.ActionRow({
        title: 'Refresh Line Speed',
        subtitle: 'Speed of the refresh line movement (1-5, slower to faster)'
    });
    const speedAdjustment = new Gtk.Adjustment({
        lower: 1,
        upper: 5,
        step_increment: 1,
        page_increment: 1,
        value: settings.get_int('pixel-refresh-speed')
    });
    const speedSpinButton = new Gtk.SpinButton({
        adjustment: speedAdjustment,
        climb_rate: 1,
        digits: 0,
        numeric: true,
        valign: Gtk.Align.CENTER
    });
    speedRow.add_suffix(speedSpinButton);
    refreshGroup.add(speedRow);

    settings.bind(
        'pixel-refresh-speed',
        speedSpinButton,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Smart refresh
    const smartRow = new Adw.ActionRow({
        title: 'Smart Refresh',
        subtitle: 'Only run when system is idle and no fullscreen apps are active'
    });
    const smartSwitch = new Gtk.Switch({
        active: settings.get_boolean('pixel-refresh-smart'),
        valign: Gtk.Align.CENTER
    });
    smartRow.add_suffix(smartSwitch);
    refreshGroup.add(smartRow);

    settings.bind(
        'pixel-refresh-smart',
        smartSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    // Schedule editor
    const scheduleRow = new Adw.ActionRow({
        title: 'Refresh Schedule',
        subtitle: 'Times when pixel refresh can run (24-hour format)'
    });
    
    const scheduleEntry = new Gtk.Entry({
        text: settings.get_strv('pixel-refresh-schedule').join(', '),
        valign: Gtk.Align.CENTER,
        width_chars: 30
    });
    
    scheduleEntry.connect('changed', () => {
        let times = scheduleEntry.get_text()
            .split(',')
            .map(t => t.trim())
            .filter(t => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t));
        settings.set_strv('pixel-refresh-schedule', times);
    });
    
    scheduleRow.add_suffix(scheduleEntry);
    refreshGroup.add(scheduleRow);

    // Status indicator
    const statusRow = new Adw.ActionRow({
        title: 'Status',
    });
    
    const statusBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 6,
        margin_bottom: 6,
        valign: Gtk.Align.CENTER
    });

    const statusLabel = new Gtk.Label({
        label: 'Idle',
        css_classes: ['caption', 'dim-label']
    });

    const nextRunLabel = new Gtk.Label({
        label: 'Next run: Not scheduled',
        css_classes: ['caption', 'dim-label']
    });

    const timeRemainingLabel = new Gtk.Label({
        label: '',
        css_classes: ['caption', 'dim-label']
    });

    const progressBar = new Gtk.ProgressBar({
        fraction: 0,
        visible: false
    });

    statusBox.append(statusLabel);
    statusBox.append(nextRunLabel);
    statusBox.append(timeRemainingLabel);
    statusBox.append(progressBar);
    statusRow.add_suffix(statusBox);
    refreshGroup.add(statusRow);

    // Update status indicators when settings change
    settings.connect('changed::pixel-refresh-running', () => {
        let running = settings.get_boolean('pixel-refresh-running');
        statusLabel.set_text(running ? 'Running' : 'Idle');
        statusLabel.set_css_classes(running ? ['caption', 'accent'] : ['caption', 'dim-label']);
        progressBar.set_visible(running);
        timeRemainingLabel.set_visible(running);
        runButton.set_sensitive(!running);
        cancelButton.set_sensitive(running);
    });

    settings.connect('changed::pixel-refresh-progress', () => {
        let progress = settings.get_int('pixel-refresh-progress');
        progressBar.set_fraction(progress / 100.0);
        if (progress > 0) {
            progressBar.set_text(`${progress}%`);
            progressBar.set_show_text(true);
        }
    });

    settings.connect('changed::pixel-refresh-time-remaining', () => {
        let seconds = settings.get_int('pixel-refresh-time-remaining');
        if (seconds > 0) {
            let minutes = Math.floor(seconds / 60);
            seconds = seconds % 60;
            timeRemainingLabel.set_text(
                `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`
            );
        } else {
            timeRemainingLabel.set_text('');
        }
    });

    settings.connect('changed::pixel-refresh-next-run', () => {
        let nextRun = settings.get_string('pixel-refresh-next-run');
        if (nextRun) {
            let date = new Date(nextRun);
            let timeString = date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
            });
            nextRunLabel.set_text(`Next run: ${timeString}`);
        } else {
            nextRunLabel.set_text('Next run: Not scheduled');
        }
    });

    // Manual control buttons
    const manualControlRow = new Adw.ActionRow({
        title: 'Manual Control',
        subtitle: 'Run or cancel pixel refresh manually'
    });

    const buttonBox = new Gtk.Box({
        spacing: 8,
        homogeneous: true,
        valign: Gtk.Align.CENTER
    });

    const runButton = new Gtk.Button({
        label: 'Run Now',
        css_classes: ['suggested-action'],
        sensitive: !settings.get_boolean('pixel-refresh-running')
    });

    const cancelButton = new Gtk.Button({
        label: 'Cancel',
        css_classes: ['destructive-action'],
        sensitive: settings.get_boolean('pixel-refresh-running')
    });

    runButton.connect('clicked', () => {
        settings.set_boolean('pixel-refresh-manual-trigger', true);
    });

    cancelButton.connect('clicked', () => {
        settings.set_boolean('pixel-refresh-manual-cancel', true);
    });

    buttonBox.append(runButton);
    buttonBox.append(cancelButton);
    manualControlRow.add_suffix(buttonBox);
    refreshGroup.add(manualControlRow);
} 