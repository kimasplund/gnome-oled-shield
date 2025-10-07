'use strict';

/**
 * Node.js test runner for GNOME OLED Shield extension
 * This script runs tests using Jasmine in a Node.js environment
 */

import Jasmine from 'jasmine';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Jasmine
const jasmine = new Jasmine();
jasmine.loadConfigFile(join(__dirname, 'jasmine.json'));

// Setup environment for tests
console.log('Setting up Node.js test environment');

// Register error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run tests
console.log('Running tests...');
jasmine.execute().catch((error) => {
    console.error('Error running tests:', error);
    process.exit(1);
});