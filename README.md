# OLED Care

A comprehensive GNOME Shell extension designed to protect OLED displays from burn-in and extend their lifespan. This extension is multi-display aware and provides multiple protection features that can be selectively applied to specific displays.

## Features

### Display Protection
- **Multi-Display Support**: Enable/disable OLED protection features per display
- **Pixel Shift**: Subtle periodic pixel shifting to prevent burn-in
- **Adaptive Dimming**: Automatically dim the screen when idle
- **Window Dimming**: Reduce brightness of unfocused windows
- **True Black Background**: Set desktop background to pure black (#000000) to turn off unused pixels

### Interface Auto-hiding
- **Auto-hide Top Panel**: Automatically hide the top panel when not in use
- **Auto-hide Dash**: Automatically hide the dash/dock when not in use
- **Smooth Animations**: Gentle fade transitions for all auto-hide features

### Pixel Refresh
- **Scheduled Refresh**: Run pixel refresh at specified times
- **Smart Scheduling**: Only run when system is idle
- **Progress Tracking**: Real-time progress and time remaining
- **Manual Control**: Run or cancel refresh on demand

### Customization Options
- **Dimming Levels**: Adjust brightness reduction (0-50%) for idle dimming
- **Window Dim Level**: Configure unfocused window dimming (0-40%)
- **Pixel Shift Interval**: Set time between pixel shifts (60-3600 seconds)
- **Idle Timeout**: Configure how long to wait before dimming (30-3600 seconds)
- **Refresh Speed**: Adjust pixel refresh line speed (1-5)

## Installation

### From source

1. Clone this repository:
   ```bash
   git clone https://github.com/kimasplund/gnome-oled-shield.git
   ```

2. Install the extension:
   ```bash
   cd gnome-oled-shield
   make install
   ```

3. Restart GNOME Shell:
   - On X11: Alt+F2, type 'r', press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable oled-care@asplund.kim
   ```

## Usage

After installation, you'll see a display brightness icon in your system tray. Click it to access:

### Quick Settings Menu
- Enable/disable OLED protection for specific monitors
- Toggle pixel shift
- Toggle window dimming
- Enable/disable true black background
- Toggle panel and dash auto-hide
- Access detailed settings

### Settings Dialog
Access the full settings dialog through:
- The system tray icon → Settings
- GNOME Extensions app
- `gnome-extensions prefs oled-care@asplund.kim`

Available settings are organized into groups:

#### Dimming Settings
- **Dimming Level**: Adjust the brightness reduction (0-50%)
- **Screen Dim Timeout**: Set how long to wait before dimming (30-3600 seconds)

#### Window Dimming Settings
- **Enable Window Dimming**: Toggle dimming of unfocused windows
- **Window Dim Level**: Set brightness reduction for unfocused windows (0-40%)

#### Pixel Shift Settings
- **Enable Pixel Shift**: Toggle periodic pixel shifting
- **Pixel Shift Interval**: Set how often pixels should shift (60-3600 seconds)

#### Interface Settings
- **True Black Background**: Enable pure black background to turn off unused pixels
- **Auto-hide Top Panel**: Hide the top panel when not in use
- **Auto-hide Dash**: Hide the dash/dock when not in use

#### Pixel Refresh Settings
- **Enable Scheduled Refresh**: Run pixel refresh at specified times
- **Refresh Speed**: Control the speed of the refresh line
- **Smart Refresh**: Only run when system is idle
- **Schedule**: Set specific times for refresh to run
- **Manual Control**: Run or cancel refresh on demand

## Requirements

- GNOME Shell 45 or later
- GJS (GNOME JavaScript)

## How It Works

The extension implements several OLED protection strategies:

1. **Pixel Shifting**: Subtly moves screen content by 1 pixel periodically to prevent static image burn-in
2. **Adaptive Dimming**: Reduces screen brightness during periods of inactivity
3. **Window Dimming**: Reduces the brightness of unfocused windows to distribute wear
4. **True Black Background**: Uses pure black (#000000) to completely turn off unused OLED pixels
5. **Interface Auto-hiding**: Reduces burn-in risk for static interface elements
6. **Pixel Refresh**: Periodically runs a white line across the screen to exercise pixels

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. When contributing, please:

- Follow the existing code style
- Add comments for complex logic
- Test your changes with multiple monitors
- Ensure proper cleanup when the extension is disabled

## Author

- **Kim Asplund**
- Website: [https://asplund.kim](https://asplund.kim)
- Email: kim.asplund@gmail.com
- GitHub: [@kimasplund](https://github.com/kimasplund)

## License

This extension is distributed under the terms of the GNU General Public License, version 2 or later.

## Support

If you encounter any issues or have suggestions, please feel free to:
1. Open an issue on GitHub
2. Contact me directly via email
3. Visit my website for more information

## Acknowledgments

- GNOME Shell developers for the extension APIs
- The GNOME community for testing and feedback
- All contributors who help improve this extension
  