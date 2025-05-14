# GNOME OLED Shield Extension

A GNOME Shell extension to protect OLED/AMOLED displays from burn-in and image retention.

## Features

- Pixel Shifting: Subtly shifts screen content to prevent static elements from burning in
- Screen Dimming: Automatically dims the screen after a period of inactivity
- Window Dimming: Dims unfocused windows to reduce burn-in risk
- Pixel Refresh: Periodically runs a pixel refresh pattern to help prevent image retention
- Multi-Display Support: Configurable per-display settings for mixed display setups
- Smart Scheduling: Intelligent scheduling of refresh operations

## Requirements

- GNOME Shell 46 or later
- GJS (GNOME JavaScript) runtime
- GNOME Builder (for development)

## Installation

### From GNOME Extensions Website
1. Visit [extensions.gnome.org](https://extensions.gnome.org)
2. Search for "OLED Shield"
3. Toggle the switch to install

### From Source (using GNOME Builder)
1. Clone this repository:
   ```bash
   git clone https://github.com/kimasplund/gnome-oled-shield.git
   ```
2. Open the project in GNOME Builder
3. Click the "Run" button or press Ctrl+F5

### Manual Installation
```bash
meson setup builddir
cd builddir
meson compile
meson install
```

## Development

### Building with GNOME Builder
1. Open GNOME Builder
2. Click "Clone Repository"
3. Enter the repository URL
4. Click "Clone Project"
5. Click "Run" to test the extension

### Running Tests
```bash
./run-tests.sh
```

### Project Structure
- `extension.js`: Main extension code
- `lib/`: Core functionality modules
  - `indicator.js`: Panel indicator implementation
  - `pixelShift.js`: Screen content shifting logic
  - `dimming.js`: Screen and window dimming
  - `displayManager.js`: Multi-display management
  - `pixelRefresh.js`: Pixel refresh implementation
- `tests/`: Unit tests
- `schemas/`: GSettings schemas
- `meson.build`: Build configuration
- `metadata.json`: Extension metadata

## Contributing

1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Run the tests
5. Submit a pull request

## License

GPL-3.0-or-later

## Author

Kim Asplund (kim.asplund@gmail.com)

## Links

- [GitHub Repository](https://github.com/kimasplund/gnome-oled-shield)
- [Personal Website](https://asplund.kim)
- [Bug Reports](https://github.com/kimasplund/gnome-oled-shield/issues)
  