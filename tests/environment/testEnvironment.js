// GNOME Shell test environment helper
import GLib from 'gi://GLib';
import * as TestUtils from 'resource:///org/gnome/shell/misc/testUtils.js';

import { setupTestEnvironment as setupWaylandEnvironment } from './wayland/session.js';
import { setupTestEnvironment as setupX11Environment } from './x11/session.js';

/**
 * Set up test environment based on session type
 */
export async function setupTestEnvironment() {
    // Determine session type
    const sessionType = GLib.getenv('XDG_SESSION_TYPE') || 'wayland';
    
    // Set up appropriate environment
    const setup = sessionType === 'x11' ? setupX11Environment : setupWaylandEnvironment;
    const env = setup();

    // Wait for environment to be ready
    await TestUtils.waitForTestEnvironment();

    return {
        sessionType,
        async cleanup() {
            await env.cleanup();
            await TestUtils.waitForTestEnvironment();
        }
    };
}

/**
 * Run tests in both Wayland and X11 environments
 */
export function runInBothEnvironments(description, testFn) {
    describe(description, () => {
        let env;

        beforeEach(async () => {
            env = await setupTestEnvironment();
        });

        afterEach(async () => {
            if (env) {
                await env.cleanup();
                env = null;
            }
        });

        // Run tests
        testFn();
    });
}

/**
 * Run tests in specific environment
 */
export function runInEnvironment(description, sessionType, testFn) {
    describe(description, () => {
        let env;

        beforeEach(async () => {
            // Override session type
            const originalSession = GLib.getenv('XDG_SESSION_TYPE');
            GLib.setenv('XDG_SESSION_TYPE', sessionType, true);

            env = await setupTestEnvironment();

            // Restore original session type
            if (originalSession)
                GLib.setenv('XDG_SESSION_TYPE', originalSession, true);
            else
                GLib.unsetenv('XDG_SESSION_TYPE');
        });

        afterEach(async () => {
            if (env) {
                await env.cleanup();
                env = null;
            }
        });

        // Run tests
        testFn();
    });
} 