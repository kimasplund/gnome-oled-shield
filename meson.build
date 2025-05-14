project('gnome-oled-shield',
        version: '1.0.0',
        meson_version: '>= 0.59.0',
        license: 'GPL-3.0-or-later')

gnome = import('gnome')

# Extension UUID
uuid = 'oled-care@asplund.kim'

# Compile schemas
compile_schemas = find_program('glib-compile-schemas', required: true)

# Install extension
install_data([
    'extension.js',
    'metadata.json',
    'stylesheet.css',
], install_dir: join_paths(get_option('datadir'), 'gnome-shell/extensions', uuid))

# Install lib files
install_data([
    'lib/indicator.js',
    'lib/pixelShift.js',
    'lib/dimming.js',
    'lib/displayManager.js',
    'lib/pixelRefresh.js',
], install_dir: join_paths(get_option('datadir'), 'gnome-shell/extensions', uuid, 'lib'))

# Install schemas
install_data('schemas/org.gnome.shell.extensions.oled-care.gschema.xml',
    install_dir: join_paths(get_option('datadir'), 'glib-2.0/schemas'))

meson.add_install_script('meson-postinstall.sh')

# Tests
test_env = environment()
test_env.set('G_TEST_SRCDIR', meson.current_source_dir())
test_env.set('G_TEST_BUILDDIR', meson.current_build_dir())

test('extension-tests',
    find_program('run-tests.sh'),
    env: test_env,
    workdir: meson.current_source_dir()) 