# GNOME OLED Shield

An advanced GNOME extension to protect OLED displays from burn-in using various protection techniques.

## Features

- **Pixel Shift**: Subtly shifts the entire screen content to prevent static elements from causing burn-in
- **Pixel Refresh**: Performs full-screen rejuvenation routines to equalize pixel wear
- **Screen Dimming**: Reduces brightness for static elements like panels and system trays
- **Display Management**: Intelligently manages multiple displays, applying protection only to OLED screens

## Modernization

This extension has been fully modernized with cutting-edge JavaScript features to enhance performance, reliability, and maintainability:

### ES2021+ Features

- **Private Class Fields** (`#fieldName`): Proper encapsulation for better security and preventing accidental API misuse
- **Static Initialization Blocks**: Cleaner initialization of static class members
- **Nullish Coalescing** (`??`): Better handling of null/undefined values
- **Optional Chaining** (`?.`): Safer property access
- **Logical Assignment** (`||=`, `&&=`, `??=`): Concise conditional assignments
- **Promise.allSettled**: Better handling of multiple async operations
- **WeakRef & FinalizationRegistry**: Advanced memory management
- **AbortController/AbortSignal**: Cancellable operations

### Architecture Improvements

- **Event-Based Communication**: Components communicate through an event system
- **Resource Management**: Automatic tracking and cleanup of resources
- **Signal Management**: Robust tracking and management of GObject signals
- **Error Handling**: Comprehensive error hierarchy with chaining
- **Metrics Collection**: Performance monitoring through metrics system

## Technical Implementation

The codebase follows a modular architecture with these key components:

### Core Infrastructure

- **EventEmitter**: Provides event-based communication between components
- **ResourceManager**: Tracks and manages resource lifecycles with WeakRef/FinalizationRegistry
- **SignalManager**: Manages GObject signal connections with automatic cleanup
- **Metrics**: Collects and analyzes performance data
- **ErrorRegistry**: Centralized error monitoring and handling

### Feature Modules

- **DisplayManager**: Manages monitor detection and display-specific settings
- **PixelShift**: Implements screen content shifting algorithms
- **PixelRefresh**: Handles full-screen refresh operations
- **Dimming**: Controls brightness reduction for static elements

## Development

### Prerequisites

- GNOME Shell 45+
- GJS 1.74+

### Building and Testing

```bash
# Clone the repository
git clone https://github.com/kimasplund/gnome-oled-shield.git
cd gnome-oled-shield

# Install to your local extensions directory
make install

# Run tests
make test
```

### Running the Tests

The extension includes a comprehensive test suite that verifies the modernization features:

```bash
# Run the modernization test suite
gjs -m tests/test-modernization.js
```

## Installation

### From GNOME Extensions Website

Visit [extensions.gnome.org](https://extensions.gnome.org) and search for "OLED Shield".

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/kimasplund/gnome-oled-shield.git

# Create extension directory
mkdir -p ~/.local/share/gnome-shell/extensions/oled-care@kimasplund.online

# Copy extension files
cp -r gnome-oled-shield/* ~/.local/share/gnome-shell/extensions/oled-care@kimasplund.online/

# Restart GNOME Shell (X11)
Alt+F2, r, Enter

# For Wayland, log out and log back in
```

## Usage

1. Enable the extension using GNOME Extensions app or the Extensions menu in GNOME Tweaks
2. Click on the shield icon in the top panel to access settings
3. Configure protection features based on your display type

### Settings

- **Pixel Shift**: Configure shift interval, distance, and speed
- **Pixel Refresh**: Schedule refresh operations or run them manually
- **Screen Dimming**: Control dimming level and which UI elements to dim
- **Display Management**: Select which displays to protect

## Technical Documentation

For detailed technical documentation of the codebase, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Credits

- **Author**: Kim Asplund (kim.asplund@gmail.com)
- **Website**: https://asplund.kim
- **GitHub**: https://github.com/kimasplund
  