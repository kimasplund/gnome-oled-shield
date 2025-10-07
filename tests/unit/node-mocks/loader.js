/**
 * Custom loader for Node.js to handle GJS-style imports
 * This allows 'gi://' imports to work in a Node.js environment
 */

const { resolveGiImport } = require('./gi.js');
const path = require('path');
const fs = require('fs');

// Create custom loader to handle 'gi://' scheme
const resolver = {
    resolveGiImport,
    
    // Map file paths based on project structure
    resolveProjectPath(specifier, context) {
        // Get base directory from context
        const baseDir = path.dirname(context.parentURL ? new URL(context.parentURL).pathname : process.cwd());
        
        // Handle relative paths
        if (specifier.startsWith('./') || specifier.startsWith('../')) {
            return new URL(specifier, `file://${baseDir}/`).href;
        }
        
        // Handle absolute paths within the project
        const projectRoot = path.resolve(process.cwd());
        const absolutePath = path.join(projectRoot, specifier);
        
        if (fs.existsSync(absolutePath)) {
            return `file://${absolutePath}`;
        }
        
        // Return the original specifier if not resolved
        return specifier;
    },
    
    // Extended resolver for other project-specific modules
    resolveProjectModule(specifier) {
        // Add mappings for your project's specific modules here
        // For example:
        if (specifier === 'system') {
            return {
                exit: (code) => {
                    console.log(`[Mock System] Would exit with code: ${code}`);
                }
            };
        }
        
        return null;
    }
};

// Register custom loader hooks
module.exports = {
    resolver,
    
    // Setup function to install custom loader
    setup() {
        // Patch the require function for CommonJS
        const originalRequire = module.require;
        module.require = function(id) {
            if (id.startsWith('gi://')) {
                const moduleName = id.substring(5);
                return resolver.resolveGiImport(moduleName);
            } else if (id === 'system') {
                return resolver.resolveProjectModule('system');
            }
            
            return originalRequire.apply(this, arguments);
        };
        
        // Add global 'imports' object to simulate GJS environment
        global.imports = {
            system: resolver.resolveProjectModule('system'),
            misc: {}
        };
        
        console.log('[Mock Loader] GJS compatibility layer installed');
    }
};