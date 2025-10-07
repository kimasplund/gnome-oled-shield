'use strict';

// Import GJS environment setup
import '../gi-module-loader.js';

// Import the modules to test
import { 
    ExtensionError, 
    ErrorRegistry, 
    ComponentError,
    OperationError 
} from '../../lib/errors.js';

describe('Error System', () => {
    describe('Error Classes', () => {
        it('should create basic extension errors', () => {
            const error = new ExtensionError('Test error message');
            
            expect(error instanceof Error).toBe(true);
            expect(error instanceof ExtensionError).toBe(true);
            expect(error.message).toBe('Test error message');
            expect(error.name).toBe('ExtensionError');
        });
        
        it('should create component errors', () => {
            const error = new ComponentError('Test component error', { 
                component: 'TestComponent' 
            });
            
            expect(error instanceof ExtensionError).toBe(true);
            expect(error instanceof ComponentError).toBe(true);
            expect(error.message).toBe('Test component error');
            expect(error.component).toBe('TestComponent');
        });
        
        it('should create operation errors', () => {
            const error = new OperationError('Test operation failed', {
                operation: 'testOperation',
                context: { param1: 'value1' }
            });
            
            expect(error instanceof ExtensionError).toBe(true);
            expect(error instanceof OperationError).toBe(true);
            expect(error.message).toBe('Test operation failed');
            expect(error.operation).toBe('testOperation');
            expect(error.context).toEqual({ param1: 'value1' });
        });
        
        it('should support error chaining with cause', () => {
            const cause = new Error('Root cause');
            const componentError = new ComponentError('Component initialization failed', {
                component: 'DisplayManager',
                cause
            });
            
            expect(componentError.cause).toBe(cause);
            expect(componentError.message).toBe('Component initialization failed');
        });
        
        it('should include metadata in errors', () => {
            const error = new ExtensionError('Test error with metadata', {
                metadata: {
                    timestamp: 1234567890,
                    severity: 'high',
                    recoverable: false
                }
            });
            
            expect(error.metadata).toBeDefined();
            expect(error.metadata.timestamp).toBe(1234567890);
            expect(error.metadata.severity).toBe('high');
            expect(error.metadata.recoverable).toBe(false);
        });
    });
    
    describe('ErrorRegistry', () => {
        let errorRegistry;
        
        beforeEach(() => {
            errorRegistry = new ErrorRegistry();
        });
        
        it('should register errors', () => {
            const error = new ExtensionError('Test error');
            const id = errorRegistry.registerError(error, 'test_context');
            
            expect(id).toBeDefined();
            expect(typeof id).toBe('string');
            
            // Verify the error was registered
            const allErrors = errorRegistry.getAllErrors();
            expect(allErrors.length).toBe(1);
            expect(allErrors[0].error).toBe(error);
            expect(allErrors[0].context).toBe('test_context');
        });
        
        it('should retrieve errors by context', () => {
            // Register errors with different contexts
            const error1 = new ExtensionError('Error 1');
            const error2 = new ExtensionError('Error 2');
            const error3 = new ExtensionError('Error 3');
            
            errorRegistry.registerError(error1, 'context_a');
            errorRegistry.registerError(error2, 'context_b');
            errorRegistry.registerError(error3, 'context_a');
            
            // Retrieve errors for context_a
            const contextAErrors = errorRegistry.getErrorsByContext('context_a');
            
            expect(contextAErrors.length).toBe(2);
            expect(contextAErrors[0].error.message).toBe('Error 1');
            expect(contextAErrors[1].error.message).toBe('Error 3');
        });
        
        it('should clear errors', () => {
            // Register some errors
            const error1 = new ExtensionError('Error 1');
            const error2 = new ExtensionError('Error 2');
            
            errorRegistry.registerError(error1, 'context_a');
            const id2 = errorRegistry.registerError(error2, 'context_b');
            
            // Clear one error
            errorRegistry.clearError(id2);
            
            // Verify only the specified error was cleared
            const allErrors = errorRegistry.getAllErrors();
            expect(allErrors.length).toBe(1);
            expect(allErrors[0].error.message).toBe('Error 1');
        });
        
        it('should clear errors by context', () => {
            // Register errors with different contexts
            const error1 = new ExtensionError('Error 1');
            const error2 = new ExtensionError('Error 2');
            const error3 = new ExtensionError('Error 3');
            
            errorRegistry.registerError(error1, 'context_a');
            errorRegistry.registerError(error2, 'context_b');
            errorRegistry.registerError(error3, 'context_a');
            
            // Clear errors for context_a
            errorRegistry.clearErrorsByContext('context_a');
            
            // Verify context_a errors were cleared
            const allErrors = errorRegistry.getAllErrors();
            expect(allErrors.length).toBe(1);
            expect(allErrors[0].error.message).toBe('Error 2');
        });
        
        it('should notify listeners about new errors', () => {
            // Create a spy for the error handler
            const errorHandler = jasmine.createSpy('errorHandler');
            
            // Add a listener
            errorRegistry.addErrorListener(errorHandler);
            
            // Register an error
            const error = new ExtensionError('Test error');
            errorRegistry.registerError(error, 'test_context');
            
            // Verify the listener was called
            expect(errorHandler).toHaveBeenCalled();
            expect(errorHandler.calls.mostRecent().args[0].error).toBe(error);
        });
        
        it('should generate error reports', () => {
            // Register some errors
            const error1 = new ComponentError('Component error', { component: 'DisplayManager' });
            const error2 = new OperationError('Operation failed', { operation: 'refreshPixels' });
            
            errorRegistry.registerError(error1, 'initialization');
            errorRegistry.registerError(error2, 'runtime');
            
            // Generate a report
            const report = errorRegistry.generateErrorReport();
            
            // Verify the report contains error information
            expect(report).toContain('Component error');
            expect(report).toContain('DisplayManager');
            expect(report).toContain('Operation failed');
            expect(report).toContain('refreshPixels');
        });
        
        it('should get error statistics', () => {
            // Register errors with different severities
            const error1 = new ExtensionError('Critical error', { level: 'critical' });
            const error2 = new ExtensionError('Warning', { level: 'warning' });
            const error3 = new ExtensionError('Another critical', { level: 'critical' });
            
            errorRegistry.registerError(error1, 'context_a');
            errorRegistry.registerError(error2, 'context_b');
            errorRegistry.registerError(error3, 'context_c');
            
            // Get statistics
            const stats = errorRegistry.getStatistics();
            
            // Verify statistics
            expect(stats.totalErrors).toBe(3);
            expect(stats.bySeverity.critical).toBe(2);
            expect(stats.bySeverity.warning).toBe(1);
            expect(stats.byContext.context_a).toBe(1);
            expect(stats.byContext.context_b).toBe(1);
            expect(stats.byContext.context_c).toBe(1);
        });
    });
    
    describe('Error Recovery', () => {
        it('should provide recovery mechanisms', () => {
            // Create an error with recovery functions
            const error = new OperationError('Operation failed, but can recover', {
                operation: 'displayRefresh',
                recoveryOptions: [
                    {
                        name: 'retry',
                        description: 'Retry the operation',
                        action: jasmine.createSpy('retryAction')
                    },
                    {
                        name: 'ignore',
                        description: 'Ignore the error',
                        action: jasmine.createSpy('ignoreAction')
                    }
                ]
            });
            
            // Verify recovery options
            expect(error.recoveryOptions.length).toBe(2);
            expect(error.recoveryOptions[0].name).toBe('retry');
            expect(error.recoveryOptions[1].name).toBe('ignore');
            
            // Trigger recovery
            error.recoveryOptions[0].action();
            
            // Verify the recovery action was called
            expect(error.recoveryOptions[0].action).toHaveBeenCalled();
        });
    });
});