#!/bin/bash

set -e  # Exit on any error

echo "Running post-installation tasks..."

# Compile GSettings schemas
echo "Compiling GSettings schemas..."
if [ -d "${MESON_INSTALL_PREFIX}/share/glib-2.0/schemas/" ]; then
    glib-compile-schemas "${MESON_INSTALL_PREFIX}/share/glib-2.0/schemas/" || {
        echo "Error: Failed to compile GSettings schemas."
        exit 1
    }
    echo "✓ GSettings schemas compiled successfully."
else
    echo "Warning: GSettings schema directory not found."
fi

# Restart GNOME Shell if running in X11
if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    echo "Attempting to restart GNOME Shell..."
    dbus-send --session --type=method_call \
        --dest=org.gnome.Shell /org/gnome/Shell \
        org.gnome.Shell.Eval string:'global.reexec_self();' &>/dev/null || {
        echo "Warning: Could not restart GNOME Shell automatically."
    }
    echo "✓ Signal sent to restart GNOME Shell."
else
    echo "Running in Wayland session. You need to log out and log back in to activate the extension."
fi

# Additional post-install checks
extension_path="${MESON_INSTALL_PREFIX}/share/gnome-shell/extensions/oled-care@asplund.kim"
if [ -d "$extension_path" ]; then
    echo "✓ Extension installed at: $extension_path"
else
    echo "Warning: Extension installation path not found. Installation may have failed."
fi

echo ""
echo "Installation complete!"
echo "To enable the extension, use GNOME Extensions app or the command line:"
echo "$ gnome-extensions enable oled-care@asplund.kim"
echo ""
echo "If the extension is not immediately available:"
echo "- On X11: Press Alt+F2, type 'r', and press Enter to restart GNOME Shell"
echo "- On Wayland: Log out and log back in to activate the extension" 