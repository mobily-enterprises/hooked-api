import { Api } from './api.js';

// Detailed explanation of the hook system

/**
 * apiInstance.hook('display', pluginName, 'defaultDisplay', {}, async (context) => { ... })
 * 
 * Breaking down each parameter:
 * 
 * 1. 'display' - The hook name (event name)
 *    This is an arbitrary string that represents a specific point in the execution flow.
 *    Other code will call executeHook('display', context) to trigger all handlers.
 * 
 * 2. pluginName - The plugin registering this hook
 *    Used for identification and ordering. In this case, it would be 'url-loader'.
 * 
 * 3. 'defaultDisplay' - Unique function name
 *    Each hook handler needs a unique name for ordering purposes.
 *    Other plugins can position themselves relative to this function.
 * 
 * 4. {} - Positioning parameters
 *    Controls execution order. Can include:
 *    - beforePlugin: Run before all handlers from specified plugin
 *    - afterPlugin: Run after all handlers from specified plugin  
 *    - beforeFunction: Run before specific named function
 *    - afterFunction: Run after specific named function
 * 
 * 5. async (context) => { ... } - The actual handler function
 *    Receives the context object and can modify it.
 *    Can return false to stop the hook chain.
 */

// Example 1: Basic hook system demonstration
async function basicHookExample() {
  console.log('=== Basic Hook Example ===\n');
  
  const api = new Api({
    name: 'HOOK_DEMO',
    version: '1.0.0'
  });
  
  // Method that uses hooks
  api.implement('processData', async (context) => {
    console.log('1. Starting process...');
    
    // Execute 'validate' hooks
    context = await api.executeHook('validate', context);
    
    console.log('3. Processing data...');
    context.processed = true;
    
    // Execute 'transform' hooks
    context = await api.executeHook('transform', context);
    
    console.log('5. Finalizing...');
    
    // Execute 'display' hooks
    context = await api.executeHook('display', context);
    
    return context;
  });
  
  // Plugin A adds validation
  api.hook('validate', 'pluginA', 'checkRequired', {}, async (context) => {
    console.log('2. Plugin A: Validating required fields');
    if (!context.data) {
      throw new Error('Data is required');
    }
  });
  
  // Plugin B adds transformation
  api.hook('transform', 'pluginB', 'uppercase', {}, async (context) => {
    console.log('4. Plugin B: Converting to uppercase');
    if (context.data && typeof context.data === 'string') {
      context.data = context.data.toUpperCase();
    }
  });
  
  // Plugin C adds display
  api.hook('display', 'pluginC', 'consoleOutput', {}, async (context) => {
    console.log('6. Plugin C: Displaying result');
    console.log(`   Result: ${context.data}`);
  });
  
  await api.execute('processData', { data: 'hello world' });
}

// Example 2: Hook ordering demonstration
async function hookOrderingExample() {
  console.log('\n\n=== Hook Ordering Example ===\n');
  
  const api = new Api({
    name: 'ORDER_DEMO',
    version: '1.0.0'
  });
  
  api.implement('runHooks', async (context) => {
    await api.executeHook('process', context);
    return context;
  });
  
  // First, add some base hooks
  api.hook('process', 'core', 'step1', {}, async (context) => {
    console.log('1. Core: Step 1');
    context.steps = ['step1'];
  });
  
  api.hook('process', 'core', 'step3', {}, async (context) => {
    console.log('3. Core: Step 3');
    context.steps.push('step3');
  });
  
  // Add a hook that runs between step1 and step3
  api.hook('process', 'extension', 'step2', 
    { afterFunction: 'step1' }, // Position after 'step1'
    async (context) => {
      console.log('2. Extension: Step 2 (inserted after step1)');
      context.steps.push('step2');
    }
  );
  
  // Add a hook at the beginning
  api.hook('process', 'prefix', 'step0',
    { beforePlugin: 'core' }, // Run before all 'core' plugin hooks
    async (context) => {
      console.log('0. Prefix: Step 0 (before all core hooks)');
      context.steps = ['step0'];
    }
  );
  
  const result = await api.execute('runHooks', {});
  console.log('\nFinal step order:', result.steps);
}

// Example 3: Real-world display hook pattern
async function displayHookPatternExample() {
  console.log('\n\n=== Display Hook Pattern Example ===\n');
  
  const api = new Api({
    name: 'DISPLAY_PATTERN',
    version: '1.0.0'
  });
  
  // Main plugin provides base functionality
  const DataFetcherPlugin = {
    name: 'data-fetcher',
    install(apiInstance, options, pluginName) {
      apiInstance.implement('fetchAndDisplay', async (context) => {
        // Fetch data
        context.data = { 
          title: 'Sample Data',
          value: 42,
          items: ['apple', 'banana', 'orange']
        };
        
        // Let other plugins transform the data
        context = await apiInstance.executeHook('beforeDisplay', context);
        
        // Execute all display hooks
        context = await apiInstance.executeHook('display', context);
        
        return context;
      });
      
      // Provide a default display implementation
      apiInstance.hook('display', pluginName, 'defaultDisplay', {}, async (context) => {
        console.log('=== Default Display ===');
        console.log(JSON.stringify(context.data, null, 2));
      });
    }
  };
  
  // Formatter plugin enhances display
  const FormatterPlugin = {
    name: 'formatter',
    dependencies: ['data-fetcher'],
    install(apiInstance, options, pluginName) {
      // Replace the default display with formatted output
      apiInstance.hook('display', pluginName, 'formattedDisplay',
        { beforeFunction: 'defaultDisplay' }, // Run instead of default
        async (context) => {
          console.log('=== Formatted Display ===');
          console.log(`Title: ${context.data.title}`);
          console.log(`Value: ${context.data.value}`);
          console.log(`Items: ${context.data.items.join(', ')}`);
          
          // Return false to prevent default display from running
          return false;
        }
      );
    }
  };
  
  // Logger plugin adds logging without replacing display
  const LoggerPlugin = {
    name: 'logger',
    dependencies: ['data-fetcher'],
    install(apiInstance, options, pluginName) {
      // Add logging before any display
      apiInstance.hook('display', pluginName, 'logDisplay',
        { beforePlugin: 'data-fetcher' }, // Run before all data-fetcher hooks
        async (context) => {
          console.log(`[LOG] Displaying data at ${new Date().toISOString()}`);
          // Don't return false - let other displays run
        }
      );
    }
  };
  
  // Test different plugin combinations
  console.log('1. With just the base plugin:');
  api.use(DataFetcherPlugin);
  await api.execute('fetchAndDisplay', {});
  
  console.log('\n2. With formatter (replaces default):');
  const api2 = new Api({ name: 'DISPLAY_PATTERN', version: '2.0.0' });
  api2.use(DataFetcherPlugin);
  api2.use(FormatterPlugin);
  await api2.execute('fetchAndDisplay', {});
  
  console.log('\n3. With both formatter and logger:');
  const api3 = new Api({ name: 'DISPLAY_PATTERN', version: '3.0.0' });
  api3.use(DataFetcherPlugin);
  api3.use(FormatterPlugin);
  api3.use(LoggerPlugin);
  await api3.execute('fetchAndDisplay', {});
}

// Example 4: Hook chain control
async function hookChainControlExample() {
  console.log('\n\n=== Hook Chain Control Example ===\n');
  
  const api = new Api({
    name: 'CHAIN_CONTROL',
    version: '1.0.0'
  });
  
  api.implement('process', async (context) => {
    await api.executeHook('validate', context);
    console.log('Processing completed!');
  });
  
  // Validation hooks
  api.hook('validate', 'validator', 'checkAge', {}, async (context) => {
    console.log('1. Checking age...');
    if (context.age && context.age < 18) {
      console.log('   Age validation failed! Stopping chain.');
      context.error = 'Must be 18 or older';
      return false; // This stops the hook chain
    }
    console.log('   Age OK');
  });
  
  api.hook('validate', 'validator', 'checkEmail', {}, async (context) => {
    console.log('2. Checking email...');
    if (!context.email || !context.email.includes('@')) {
      console.log('   Email validation failed! Stopping chain.');
      context.error = 'Invalid email';
      return false;
    }
    console.log('   Email OK');
  });
  
  api.hook('validate', 'validator', 'checkPermissions', {}, async (context) => {
    console.log('3. Checking permissions...');
    console.log('   Permissions OK');
  });
  
  console.log('Test 1: All validations pass');
  await api.execute('process', { age: 25, email: 'user@example.com' });
  
  console.log('\nTest 2: Age validation fails');
  await api.execute('process', { age: 16, email: 'user@example.com' });
  
  console.log('\nTest 3: Email validation fails');
  await api.execute('process', { age: 25, email: 'invalid' });
}

// Run examples
// basicHookExample().catch(console.error);
// hookOrderingExample().catch(console.error);
// displayHookPatternExample().catch(console.error);
// hookChainControlExample().catch(console.error);

export { basicHookExample, hookOrderingExample, displayHookPatternExample, hookChainControlExample };