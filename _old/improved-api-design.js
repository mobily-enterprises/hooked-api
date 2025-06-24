import { Api } from './api.js';

// Proposed improvement: Make both API options and resource options easily available

// Option 1: Modify the execute method to inject both options
class ImprovedApi extends Api {
  async execute(method, context = {}) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    // Prepare an enriched context with all relevant data
    const enrichedContext = {
      ...context,
      apiInstance: this,
      apiOptions: this.options, // API-level options
    };
    
    // If called through a resource, add resource-specific data
    if (context.resourceName) {
      const resourceConfig = this._resources.get(context.resourceName);
      enrichedContext.resourceOptions = resourceConfig?.options || {};
      enrichedContext.resourceConstants = resourceConfig?.constants || null;
    }
    
    const result = await handler(enrichedContext);
    
    // Clean up temporary properties
    delete enrichedContext.apiInstance;
    delete enrichedContext.apiOptions;
    delete enrichedContext.resourceOptions;
    delete enrichedContext.resourceConstants;
    
    return result;
  }
}

// Option 2: Pass options as a second parameter
class AlternativeApi extends Api {
  async execute(method, context = {}) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    // Build options object
    const options = {
      api: this.options,
      resource: null,
      constants: {
        api: this.constants,
        resource: null
      }
    };
    
    if (context.resourceName) {
      const resourceConfig = this._resources.get(context.resourceName);
      options.resource = resourceConfig?.options || {};
      options.constants.resource = resourceConfig?.constants || null;
    }
    
    context.apiInstance = this;
    
    // Pass both context and options
    const result = await handler(context, options);
    
    delete context.apiInstance;
    
    return result;
  }
  
  // Would need to update implement() to match
  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`);
    }
    // Wrapper to maintain backward compatibility
    const wrappedHandler = handler.length === 1 
      ? handler  // Old style - single parameter
      : handler; // New style - two parameters
      
    this.implementers.set(method, wrappedHandler);
    return this;
  }
}

// Example usage showing the improved pattern
async function demonstrateImprovedPattern() {
  console.log('=== Improved API Design Demo ===\n');
  
  // Using Option 1: Enriched context
  const apiV1 = new ImprovedApi({
    name: 'STORE_API',
    version: '2.0.0',
    baseUrl: 'https://api.store.com',
    timeout: 30000,
    retries: 3
  });
  
  apiV1.implement('fetch', async (context) => {
    console.log('Option 1 - Enriched Context:');
    console.log('  API name:', context.apiOptions.name);
    console.log('  API version:', context.apiOptions.version);
    console.log('  API baseUrl:', context.apiOptions.baseUrl);
    
    if (context.resourceName) {
      console.log('  Resource name:', context.resourceName);
      console.log('  Resource options:', context.resourceOptions);
      
      // Build URL from API and resource options
      const baseUrl = context.apiOptions.baseUrl;
      const endpoint = context.resourceOptions.endpoint || context.resourceName;
      const finalUrl = `${baseUrl}/${endpoint}`;
      
      console.log('  Final URL:', finalUrl);
    }
    
    return { success: true };
  });
  
  apiV1.addResource('products', {
    endpoint: 'v2/products',
    pageSize: 50,
    includeMetadata: true
  });
  
  await apiV1.instanceResources.products.fetch();
  
  // Using Option 2: Separate parameters
  console.log('\n');
  
  const apiV2 = new AlternativeApi({
    name: 'STORE_API_ALT',
    version: '2.0.0',
    baseUrl: 'https://api.store.com',
    timeout: 30000
  });
  
  apiV2.implement('fetch', async (context, options) => {
    console.log('Option 2 - Separate Parameters:');
    console.log('  Context:', context);
    console.log('  Options:', JSON.stringify(options, null, 2));
    
    // Very clean access to all options
    const url = `${options.api.baseUrl}/${options.resource?.endpoint || context.resourceName}`;
    console.log('  Final URL:', url);
    
    return { success: true };
  });
  
  apiV2.addResource('orders', {
    endpoint: 'v2/orders',
    requiresAuth: true
  });
  
  await apiV2.instanceResources.orders.fetch();
}

// Example plugin that uses both sets of options
const SmartHttpPlugin = {
  name: 'smart-http',
  install(apiInstance, pluginOptions, pluginName) {
    apiInstance.implement('get', async (context) => {
      // Current way - digging for options
      const apiOpts = apiInstance.options;
      const resourceOpts = apiInstance._resources.get(context.resourceName)?.options || {};
      
      // Build configuration merging all option sources
      const config = {
        // Start with API-level defaults
        baseUrl: apiOpts.baseUrl || pluginOptions.defaultBaseUrl,
        timeout: apiOpts.timeout || pluginOptions.timeout || 30000,
        headers: apiOpts.headers || {},
        
        // Override with resource-specific options
        ...resourceOpts,
        
        // Override with context (runtime) options
        ...context
      };
      
      // Now we have a properly merged configuration
      const url = context.url || `${config.baseUrl}/${config.endpoint || context.resourceName}`;
      
      console.log('Smart HTTP GET:');
      console.log('  Final URL:', url);
      console.log('  Timeout:', config.timeout);
      console.log('  Headers:', config.headers);
      
      // Simulate fetch
      return { 
        url,
        data: `Fetched from ${url}`,
        config 
      };
    });
  }
};

// Demo of current vs improved
async function compareApproaches() {
  console.log('=== Current vs Improved Approach ===\n');
  
  // Current approach
  const currentApi = new Api({
    name: 'CURRENT_API',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
    apiKey: 'secret123'
  });
  
  currentApi.use(SmartHttpPlugin, {
    defaultBaseUrl: 'https://fallback.com',
    timeout: 5000
  });
  
  currentApi.addResource('users', {
    endpoint: 'v1/users',
    timeout: 10000, // Override API timeout
    cache: true
  });
  
  console.log('Current approach - implementer has to dig for options:');
  const result1 = await currentApi.instanceResources.users.get();
  console.log('Result:', result1.data);
  
  // With improved approach, implementers would have immediate access to:
  // - context.apiOptions (API instance options)
  // - context.resourceOptions (Resource-specific options)  
  // - context (runtime parameters)
  // Making it much easier to build properly layered configurations
}

// Run demos
// demonstrateImprovedPattern().catch(console.error);
// compareApproaches().catch(console.error);

export { ImprovedApi, AlternativeApi, SmartHttpPlugin };