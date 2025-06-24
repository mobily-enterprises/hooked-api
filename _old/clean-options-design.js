import { Api } from './api.js';

// Clean design with separate options parameter

class CleanApi extends Api {
  async execute(method, context = {}) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    // Build the options object - this is framework data, not user data
    const options = {
      apiOptions: this.options,           // Full API instance options
      resourceOptions: null,              // Resource options if applicable
      resourceName: null,                 // Resource name if applicable
      apiInstance: this                   // Reference to the API instance
    };
    
    // If called through a resource, include resource data
    if (context.resourceName) {
      const resourceConfig = this._resources.get(context.resourceName);
      options.resourceOptions = resourceConfig?.options || {};
      options.resourceName = context.resourceName;
      
      // Also expose constants in options
      options.apiConstants = this.constants;
      options.resourceConstants = resourceConfig?.constants || new Map();
    } else {
      options.apiConstants = this.constants;
      options.resourceConstants = null;
    }
    
    // Keep context clean - remove framework-injected properties
    delete context.resourceName;
    delete context.apiInstance;
    
    // Call handler with clean separation
    const result = await handler(context, options);
    
    return result;
  }
  
  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`);
    }
    
    // Check if handler expects options (2 params) or just context (1 param)
    if (handler.length <= 1) {
      // Legacy single-parameter handler - wrap it
      const legacyHandler = handler;
      handler = async (context, options) => {
        // For backward compatibility, inject old-style properties
        context.apiInstance = options.apiInstance;
        context.resourceName = options.resourceName;
        const result = await legacyHandler(context);
        delete context.apiInstance;
        delete context.resourceName;
        return result;
      };
    }
    
    this.implementers.set(method, handler);
    return this;
  }
}

// Example: Clean HTTP client implementation
const HttpClientPlugin = {
  name: 'http-client',
  install(apiInstance, pluginOptions, pluginName) {
    // All implementers now receive (context, options)
    apiInstance.implement('request', async (context, options) => {
      // Context is purely user domain - request parameters
      const {
        method = 'GET',
        path = '',
        data = null,
        headers = {},
        ...otherParams
      } = context;
      
      // Options is framework domain - configuration
      const baseUrl = options.resourceOptions?.baseUrl || 
                     options.apiOptions.baseUrl || 
                     pluginOptions.defaultBaseUrl;
      
      const timeout = options.resourceOptions?.timeout || 
                     options.apiOptions.timeout || 
                     pluginOptions.timeout || 
                     30000;
      
      // Build request
      const url = `${baseUrl}${path}`;
      const requestConfig = {
        method,
        headers: {
          ...options.apiOptions.headers,        // API-level headers
          ...options.resourceOptions?.headers,   // Resource-level headers
          ...headers                              // Request-level headers
        },
        timeout,
        ...otherParams
      };
      
      console.log(`${method} ${url}`);
      console.log('Config:', requestConfig);
      
      // Simulate request
      return {
        status: 200,
        data: { message: `${method} request to ${url}` },
        options: {
          api: options.apiOptions.name,
          resource: options.resourceName
        }
      };
    });
    
    // Convenience methods
    ['get', 'post', 'put', 'delete'].forEach(method => {
      apiInstance.implement(method, async (context, options) => {
        return await options.apiInstance.execute('request', {
          ...context,
          method: method.toUpperCase()
        });
      });
    });
  }
};

// Example: Resource-aware caching
const CachingPlugin = {
  name: 'caching',
  install(apiInstance, pluginOptions, pluginName) {
    const cache = new Map();
    
    apiInstance.implement('getCached', async (context, options) => {
      // Build cache key from resource identity
      const cacheKey = `${options.apiOptions.name}:${options.apiOptions.version}:${options.resourceName || 'global'}:${context.key || 'default'}`;
      
      if (cache.has(cacheKey)) {
        console.log(`Cache hit: ${cacheKey}`);
        return cache.get(cacheKey);
      }
      
      console.log(`Cache miss: ${cacheKey}`);
      
      // Get data using the fetcher from context
      const data = await context.fetcher();
      
      // Cache it
      cache.set(cacheKey, data);
      
      // Use resource-specific TTL or fall back to API/plugin TTL
      const ttl = options.resourceOptions?.cacheTTL || 
                 options.apiOptions.cacheTTL || 
                 pluginOptions.defaultTTL || 
                 60000;
      
      setTimeout(() => {
        cache.delete(cacheKey);
        console.log(`Cache expired: ${cacheKey}`);
      }, ttl);
      
      return data;
    });
  }
};

// Usage demonstration
async function demonstrateCleanDesign() {
  console.log('=== Clean Options Design Demo ===\n');
  
  const api = new CleanApi({
    name: 'CUSTOMER_API',
    version: '3.0.0',
    baseUrl: 'https://api.company.com',
    timeout: 20000,
    headers: {
      'X-API-Version': '3.0'
    },
    cacheTTL: 300000 // 5 minutes default
  });
  
  api.use(HttpClientPlugin, {
    defaultBaseUrl: 'https://fallback.api.com'
  });
  
  api.use(CachingPlugin, {
    defaultTTL: 60000 // 1 minute default
  });
  
  // Add resources with their own configurations
  api.addResource('customers', {
    baseUrl: 'https://customers.api.company.com', // Override base URL
    timeout: 5000, // Fast timeout for customer service
    cacheTTL: 600000, // Cache customers for 10 minutes
    headers: {
      'X-Service': 'customers'
    }
  });
  
  api.addResource('orders', {
    // Uses API's baseUrl
    endpoint: '/v3/orders',
    cacheTTL: 30000, // Cache orders for only 30 seconds
    headers: {
      'X-Service': 'orders'
    }
  });
  
  // Example 1: Simple GET request
  console.log('1. Simple GET request:\n');
  const customers = await api.instanceResources.customers.get({
    path: '/list',
    headers: {
      'X-Request-ID': '12345'
    }
  });
  console.log('Response:', customers);
  
  // Example 2: Cached request
  console.log('\n2. Cached request:\n');
  const cachedData = await api.instanceResources.orders.getCached({
    key: 'recent-orders',
    fetcher: async () => {
      // This is the user's fetcher function
      const response = await api.instanceResources.orders.get({
        path: '/recent'
      });
      return response.data;
    }
  });
  console.log('Cached data:', cachedData);
  
  // Example 3: Direct API call (no resource)
  console.log('\n3. Direct API call:\n');
  const directCall = await api.execute('request', {
    method: 'POST',
    path: '/auth/login',
    data: { username: 'user', password: 'pass' }
  });
  console.log('Direct response:', directCall);
}

// Example showing how implementers stay clean
const BusinessLogicPlugin = {
  name: 'business-logic',
  install(apiInstance, pluginOptions, pluginName) {
    apiInstance.implement('createOrder', async (context, options) => {
      // Context is pure business domain
      const { 
        customerId, 
        items, 
        shippingAddress,
        paymentMethod 
      } = context;
      
      // Validate using business rules
      if (!customerId || !items || items.length === 0) {
        throw new Error('Invalid order data');
      }
      
      // Use configuration from options
      const maxItemsPerOrder = options.resourceOptions?.maxItems || 
                              options.apiOptions.maxItemsPerOrder || 
                              100;
      
      if (items.length > maxItemsPerOrder) {
        throw new Error(`Too many items. Maximum is ${maxItemsPerOrder}`);
      }
      
      // Create order using another method
      const order = await options.apiInstance.execute('post', {
        path: '/orders',
        data: {
          customerId,
          items,
          shippingAddress,
          paymentMethod,
          createdAt: new Date().toISOString()
        }
      });
      
      return order;
    });
  }
};

// Run demo
// demonstrateCleanDesign().catch(console.error);

export { CleanApi, HttpClientPlugin, CachingPlugin, BusinessLogicPlugin };