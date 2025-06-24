import { Api } from './api.js';

// Different ways implementers can access resource configuration

// Pattern 1: Direct access through context (as you mentioned)
const Pattern1Plugin = {
  name: 'pattern1',
  install(apiInstance, options, pluginName) {
    apiInstance.implement('method1', async (context) => {
      // Access through context properties that are injected
      const resourceName = context.resourceName;
      const resourceConfig = apiInstance._resources.get(resourceName);
      
      console.log('Pattern 1 - Direct _resources access:');
      console.log('  Resource name:', resourceName);
      console.log('  Resource options:', resourceConfig?.options);
      
      return resourceConfig?.options;
    });
  }
};

// Pattern 2: Through context.apiInstance (temporary property)
const Pattern2Plugin = {
  name: 'pattern2', 
  install(apiInstance, options, pluginName) {
    apiInstance.implement('method2', async (context) => {
      // During execution, context.apiInstance is temporarily available
      const api = context.apiInstance;
      const resourceName = context.resourceName;
      const resourceConfig = api._resources.get(resourceName);
      
      console.log('Pattern 2 - Through context.apiInstance:');
      console.log('  Resource options:', resourceConfig?.options);
      
      return resourceConfig?.options;
    });
  }
};

// Pattern 3: Pass resource data through context
const Pattern3Plugin = {
  name: 'pattern3',
  install(apiInstance, options, pluginName) {
    // Hook that enriches context with resource data
    apiInstance.hook('beforeMethod', pluginName, 'enrichContext', {}, async (context) => {
      if (context.resourceName) {
        const resourceConfig = apiInstance._resources.get(context.resourceName);
        context.resourceOptions = resourceConfig?.options;
        context.resourceConstants = resourceConfig?.constants;
      }
    });
    
    apiInstance.implement('method3', async (context) => {
      // First execute the enrichment hook
      await context.apiInstance.executeHook('beforeMethod', context);
      
      console.log('Pattern 3 - Enriched context:');
      console.log('  Resource options:', context.resourceOptions);
      
      return context.resourceOptions;
    });
  }
};

// Pattern 4: Resource-specific implementers have direct access
const Pattern4Example = () => {
  const api = new Api({
    name: 'PATTERN4_API',
    version: '1.0.0'
  });
  
  api.addResource('users',
    { 
      baseUrl: 'https://api.example.com/users',
      timeout: 5000 
    },
    {},
    {
      // Resource-specific implementers can close over the resource config
      getConfig: async function(context) {
        // This function is defined within addResource, so it could theoretically
        // access the resourceOptions directly if they were in scope
        // But as implemented, it still needs to go through the API instance
        const resourceConfig = context.apiInstance._resources.get(context.resourceName);
        
        console.log('Pattern 4 - Resource-specific method:');
        console.log('  Options:', resourceConfig.options);
        
        return resourceConfig.options;
      }
    }
  );
  
  return api;
};

// Pattern 5: Using a factory pattern for resource-aware methods
const createResourceAwarePlugin = (enrichContext = true) => {
  return {
    name: 'resource-aware',
    install(apiInstance, options, pluginName) {
      // Optionally auto-enrich all contexts
      if (enrichContext) {
        const originalExecute = apiInstance.execute.bind(apiInstance);
        apiInstance.execute = async function(method, context = {}) {
          // Enrich context before execution
          if (context.resourceName) {
            const resourceConfig = this._resources.get(context.resourceName);
            context.resourceOptions = resourceConfig?.options || {};
          }
          return originalExecute(method, context);
        };
      }
      
      apiInstance.implement('method5', async (context) => {
        console.log('Pattern 5 - Auto-enriched context:');
        console.log('  Resource options:', context.resourceOptions);
        
        // Now resourceOptions is always available if called through a resource
        const url = context.resourceOptions?.url || context.url;
        console.log('  URL:', url);
        
        return context.resourceOptions;
      });
    }
  };
};

// Demo function
async function demonstratePatterns() {
  console.log('=== Resource Access Patterns ===\n');
  
  // Setup API with all patterns
  const api = new Api({
    name: 'DEMO_API',
    version: '1.0.0'
  });
  
  api.use(Pattern1Plugin);
  api.use(Pattern2Plugin);
  api.use(Pattern3Plugin);
  api.use(createResourceAwarePlugin(true));
  
  // Add a resource with configuration
  api.addResource('products', {
    url: 'https://api.store.com/products',
    apiKey: 'secret123',
    pageSize: 50
  });
  
  // Test each pattern
  console.log('Testing Pattern 1:');
  await api.instanceResources.products.method1();
  
  console.log('\nTesting Pattern 2:');
  await api.instanceResources.products.method2();
  
  console.log('\nTesting Pattern 3:');
  await api.instanceResources.products.method3();
  
  console.log('\nTesting Pattern 5:');
  await api.instanceResources.products.method5({ customParam: 'test' });
  
  // Test Pattern 4
  console.log('\nTesting Pattern 4:');
  const api4 = Pattern4Example();
  await api4.instanceResources.users.getConfig();
  
  // What about direct API calls (no resource)?
  console.log('\n\nDirect API calls (no resource):');
  try {
    await api.execute('method1', { someData: 'test' });
  } catch (e) {
    console.log('Pattern 1 fails without resource:', e.message);
  }
}

// Better pattern: Design plugin to work with or without resources
const RobustPlugin = {
  name: 'robust',
  install(apiInstance, options, pluginName) {
    apiInstance.implement('robustMethod', async (context) => {
      // Safely access resource config if available
      let config = {};
      
      if (context.resourceName) {
        const resourceConfig = apiInstance._resources.get(context.resourceName);
        config = { ...resourceConfig?.options };
      }
      
      // Merge with context overrides
      config = { ...config, ...context };
      
      // Now use config safely
      const url = config.url || options.defaultUrl || 'https://example.com';
      
      console.log('Robust method:');
      console.log('  Final URL:', url);
      console.log('  Has resource:', !!context.resourceName);
      
      return config;
    });
  }
};

// Run demo
// demonstratePatterns().catch(console.error);

export { 
  Pattern1Plugin, 
  Pattern2Plugin, 
  Pattern3Plugin, 
  Pattern4Example,
  createResourceAwarePlugin,
  RobustPlugin 
};