#!/bin/sh

# Compile GSettings schemas
glib-compile-schemas "${MESON_INSTALL_PREFIX}/share/glib-2.0/schemas/"

# Restart GNOME Shell if running in X11
if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    echo "Restarting GNOME Shell..."
    dbus-send --session --type=method_call \
        --dest=org.gnome.Shell /org/gnome/Shell \
        org.gnome.Shell.Eval string:'global.reexec_self();'
fi

echo "Installation complete. You may need to restart GNOME Shell (Alt+F2, r, Enter) or log out and back in for the extension to take effect." 