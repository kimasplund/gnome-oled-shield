project('gnome-oled-shield',
        version: '1.0.0',
        meson_version: '>= 0.59.0',
        license: 'GPL-3.0-or-later')

gnome = import('gnome')

# Extension UUID
uuid = 'oled-care@asplund.kim'

# Get version from metadata.json
metadata_json = run_command('python3', '-c', 
    'import json; print(json.load(open("metadata.json"))["version"])', 
    check: true).stdout().strip()

# Compile schemas
compile_schemas = find_program('glib-compile-schemas', required: true)

# Core files
core_files = [
    'extension.js',
    'prefs.js',
    'metadata.json',
    'stylesheet.css',
]

# Library files - updated to include all modernized files
lib_files = [
    'lib/compatibility.js',
    'lib/errors.js',
    'lib/eventEmitter.js',
    'lib/resourceManager.js',
    'lib/signalManager.js',
    'lib/metrics.js',
    'lib/displayManager.js',
    'lib/pixelRefresh.js',
    'lib/pixelShift.js',
    'lib/dimming.js',
    'lib/indicator.js',
]

# Install core extension files
install_data(core_files,
    install_dir: join_paths(get_option('datadir'), 'gnome-shell/extensions', uuid))

# Install lib files
install_data(lib_files,
    install_dir: join_paths(get_option('datadir'), 'gnome-shell/extensions', uuid, 'lib'))

# Install schemas
schemas_dir = join_paths(get_option('datadir'), 'glib-2.0/schemas')
install_data('schemas/org.gnome.shell.extensions.oled-care.gschema.xml',
    install_dir: schemas_dir)

# Post-installation script
meson.add_install_script('meson-postinstall.sh')

# Tests
test_env = environment()
test_env.set('G_TEST_SRCDIR', meson.current_source_dir())
test_env.set('G_TEST_BUILDDIR', meson.current_build_dir())

# Add all test files explicitly to ensure they're included in the build
test_files = [
    'tests/testUtils.js',
    'tests/unit/localTestUtils.js',
    'tests/unit/test-compatibility.js',
    'tests/unit/test-eventEmitter-sessions.js',
    'tests/unit/mocks/abort.js',
    'tests/unit/mocks/global.js',
    'tests/unit/mocks/meta.js',
    'tests/unit/mocks/main.js',
    'tests/unit/mocks/adw.js',
    'tests/unit/mocks/gio.js',
    'tests/unit/mocks/gtk.js',
    'tests/unit/mocks/clutter.js',
    'tests/unit/mocks/timeout.js',
    'tests/unit/mocks/misc.js',
    'tests/unit/mocks/prefs.js',
    'tests/test-modern-features.js',
    'tests/test-modernization.js',
    'tests/test-pixelshift.js',
]

# Install test files
install_data(test_files,
    install_dir: join_paths(get_option('datadir'), 'gnome-shell/extensions', uuid, 'tests'))

# Add test
test('extension-tests',
    find_program('run-tests.sh'),
    env: test_env,
    workdir: meson.current_source_dir())

# Custom target for building a zip file
run_target('zip',
    command: [
        find_program('bash'),
        '-c',
        'mkdir -p build && ' +
        'cp -r ' + ' '.join(core_files) + ' build/ && ' +
        'mkdir -p build/lib && ' +
        'cp -r ' + ' '.join(lib_files) + ' build/lib/ && ' +
        'mkdir -p build/schemas && ' +
        'cp -r schemas/*.xml build/schemas/ && ' +
        'mkdir -p build/tests/unit/mocks && ' +
        'cp -r tests/testUtils.js build/tests/ && ' +
        'cp -r tests/test-*.js build/tests/ && ' +
        'cp -r tests/unit/test-*.js build/tests/unit/ && ' +
        'cp -r tests/unit/localTestUtils.js build/tests/unit/ && ' +
        'cp -r tests/unit/mocks/*.js build/tests/unit/mocks/ && ' +
        'cp -r run-tests.sh build/ && ' +
        'cp -r build-and-install.sh build/ && ' +
        'cd build && ' +
        'glib-compile-schemas schemas/ && ' +
        'zip -r ../dist/' + uuid + '-v' + metadata_json + '.zip ' +
        '    extension.js prefs.js metadata.json stylesheet.css schemas/ lib/ ' +
        '    tests/ run-tests.sh build-and-install.sh'
    ],
    depends: []
) 