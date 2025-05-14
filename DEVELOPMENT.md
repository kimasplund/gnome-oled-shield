# Development Guide for OLED Care

This document provides instructions for building, debugging, and developing the OLED Care GNOME extension.

## Prerequisites

Before you start, ensure you have the following installed:

- GNOME Shell (version 46 or later)
- GJS (GNOME JavaScript)
- Build dependencies:
  - `jq` - For JSON manipulation
  - `libxml2-utils` - For XML validation (provides `xmllint`)
  - `inotify-tools` - For file watching during development (optional)
  - `eslint` - For code linting (optional)

For Ubuntu/Debian-based distributions:
```bash
sudo apt install jq libxml2-utils inotify-tools npm
npm install -g eslint
```

## Build and Installation

The extension includes a comprehensive Makefile with various targets for building and installation.

### Set Up Development Environment

```bash
make dev-setup
```

This command installs development dependencies and sets up a development version of the extension.

### Standard Build and Installation

To build and install the extension:

```bash
make install
```

For development, it's better to use:

```bash
make install-dev
```

This creates a development version with a different UUID, allowing you to have both the stable and development versions installed simultaneously.

### Watching for Changes

During development, you can watch for changes and automatically reinstall:

```bash
make watch
```

This uses `inotifywait` to monitor files and rebuilds when changes are detected.

### Restarting GNOME Shell

After installing or updating the extension, you need to restart GNOME Shell:

- On X11: `Alt+F2`, type `r`, press Enter
- On Wayland: Log out and log back in

Or use the provided command (X11 only):

```bash
make restart-shell
```

## Debugging

### Enabling Debug Mode

The extension includes a debug mode that enables detailed logging:

1. Open the extension preferences:
   ```bash
   gnome-extensions prefs oled-care@asplund.kim-dev
   ```

2. Or, manually enable debug mode via gsettings:
   ```bash
   gsettings set org.gnome.shell.extensions.oled-care debug-mode true
   ```

### Viewing Logs

To view logs from the extension:

```bash
journalctl -f -o cat GNOME_SHELL_EXTENSION_NAME="OLED Care"
```

For older versions of GNOME:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i "OLED Care"
```

Or for more complete debugging:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

### Looking Glass

GNOME Shell includes a built-in debugger called Looking Glass:

1. Press `Alt+F2`
2. Type `lg` and press Enter
3. Use the "Extensions" tab to inspect the OLED Care extension
4. You can run JavaScript commands and inspect objects in real-time

### Common Issues

- **Extension Not Appearing**: Check if it's properly installed with `gnome-extensions list`
- **Preferences Not Working**: Validate your schema XML with `make validate-json`
- **Extension Crashes**: Look for errors in the logs using the commands above

## Testing

### Manual Testing

Test the following functionality after making changes:

1. Pixel shifting functionality
2. Dimming behavior (idle and window dimming)
3. Pixel refresh operations
4. Multi-display support
5. Different session modes (normal and lock screen)

### Running Tests

The extension includes a placeholder for automated tests:

```bash
make test
```

(Note: Automated testing functionality needs to be implemented)

## Building Distribution Package

To create a distributable zip package:

```bash
make package
```

This creates a ZIP file in the `dist/` directory that can be installed through the GNOME Extensions website.

## Cleaning Up

To remove build artifacts:

```bash
make clean
```

To uninstall the development version:

```bash
make uninstall-dev
```

To uninstall the regular version:

```bash
make uninstall
``` 