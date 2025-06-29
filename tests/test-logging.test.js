import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, LogLevel, resetGlobalRegistryForTesting, ConfigurationError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Logging System', async (t) => {
  await t.test('should respect log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: 'warn', logger: customLogger }
    });
    api.customize({
      apiMethods: {
        testLogging: async ({ log }) => {
          log.trace('trace message');
          log.debug('debug message');
          log.info('info message');
          log.warn('warn message');
          log.error('error message');
        }
      }
    });

    await api.testLogging();
    
    // Only warn and error should be logged
    const logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('trace message'));
    assert.ok(!logMessages.includes('debug message'));
    assert.ok(!logMessages.includes('info message'));
    assert.ok(logMessages.includes('warn message'));
    assert.ok(logMessages.includes('error message'));
  });

  await t.test('should support numeric log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: LogLevel.WARN, logger: customLogger }
    });
    api.customize({
      apiMethods: {
        testLogging: async ({ log }) => {
          log.info('info message');
          log.warn('warn message');
        }
      }
    });

    await api.testLogging();
    
    const logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('info message'));
    assert.ok(logMessages.includes('warn message'));
  });

  await t.test('should provide log object to all handlers', async () => {
    let logInfo = {};
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        checkLog: async ({ log }) => {
          logInfo.hasLog = !!log;
          logInfo.type = typeof log;
          if (log) {
            logInfo.hasError = typeof log.error === 'function';
            logInfo.hasWarn = typeof log.warn === 'function';
            logInfo.hasInfo = typeof log.info === 'function';
            logInfo.hasDebug = typeof log.debug === 'function';
            logInfo.hasTrace = typeof log.trace === 'function';
            // Also check if log itself is callable
            logInfo.isCallable = typeof log === 'function';
          }
          return logInfo;
        }
      }
    });

    const result = await api.checkLog();
    // Debug output
    if (!result.hasLog || !result.hasError || !result.hasWarn || !result.hasInfo || !result.hasDebug || !result.hasTrace) {
      console.log('Log test failed. Log info:', result);
    }
    assert.ok(result.hasLog, 'Log object should be provided');
    assert.ok(result.hasError && result.hasWarn && result.hasInfo && result.hasDebug && result.hasTrace, 
              'Log object should have all logging methods');
  });

  await t.test('should handle scope-specific log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: 'warn', logger: customLogger }
    });
    api.customize({
      scopeMethods: {
        testLogging: async ({ log }) => {
          log.debug('debug from scope');
          log.warn('warn from scope');
        }
      }
    });

    // Add scope with debug level
    api.addScope('verbose', { logging: { level: 'debug' } });
    api.addScope('normal', {});

    // Test verbose scope - should see debug
    await api.scopes.verbose.testLogging();
    let logMessages = logs.join(' ');
    assert.ok(logMessages.includes('debug from scope'));
    assert.ok(logMessages.includes('warn from scope'));

    // Clear and test normal scope - should not see debug
    logs.length = 0;
    await api.scopes.normal.testLogging();
    logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('debug from scope'));
    assert.ok(logMessages.includes('warn from scope'));
  });

  await t.test('should validate log level configuration', () => {
    assert.throws(
      () => new Api({
        name: 'test',
        version: '1.0.0',
        logging: { level: 5 } // Invalid numeric level
      }),
      ConfigurationError
    );
  });
});