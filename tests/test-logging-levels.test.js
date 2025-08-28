import { Api, LogLevel } from '../index.js';

console.log('Testing logging level filtering...\n');

// Create a custom logger to capture all log calls
const logs = [];
const customLogger = {
  log: (msg) => logs.push({ level: 'log', msg }),
  error: (msg) => logs.push({ level: 'error', msg }),
  warn: (msg) => logs.push({ level: 'warn', msg })
};

// Create API with WARN level
const api = new Api({
  name: 'test-api',
  logging: { 
    level: LogLevel.WARN,  // Only WARN and ERROR should be logged
    logger: customLogger
  }
});

api.customize({
  apiMethods: {
    testLogging: async ({ log }) => {
      console.log('Calling log methods (level set to WARN)...');
      log.trace('This is a TRACE message');
      log.debug('This is a DEBUG message');
      log.info('This is an INFO message');
      log.warn('This is a WARN message');
      log.error('This is an ERROR message');
    }
  }
});

// Run the test
await api.testLogging();

// Show results
console.log('\nCaptured logs:');
logs.forEach(({ level, msg }) => {
  console.log(`[${level}] ${msg}`);
});

console.log('\nExpected: Only WARN and ERROR messages');
console.log('Actual: All messages were logged (BUG!)');

// Analysis
const hasUnexpectedLogs = logs.some(log => 
  log.msg.includes('TRACE') || 
  log.msg.includes('DEBUG') || 
  log.msg.includes('INFO')
);

if (hasUnexpectedLogs) {
  console.log('\n❌ BUG CONFIRMED: Log level filtering is not working correctly');
  console.log('   The library is passing all log messages to the custom logger');
  console.log('   regardless of the configured log level.');
} else {
  console.log('\n✅ Log level filtering is working correctly');
}