import { Api } from './index-cleaned.js';

// Simple: Configuration storage
const configApi = new Api({
  name: 'config',
  version: '1.0.0',
  constants: {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3
  }
});

console.log(configApi.constants.get('apiUrl')); // https://api.example.com

// Simple: Utility functions
const utilsApi = new Api({
  name: 'utils',
  version: '1.0.0',
  implementers: {
    formatDate: (context) => {
      const date = new Date(context.timestamp);
      return date.toLocaleDateString();
    },
    capitalize: (context) => {
      return context.text.charAt(0).toUpperCase() + context.text.slice(1);
    }
  }
});

await utilsApi.execute('formatDate', { timestamp: Date.now() });
await utilsApi.execute('capitalize', { text: 'hello' }); // Hello

// Medium: Calculator with plugins
const calcApi = new Api({
  name: 'calculator',
  version: '1.0.0',
  implementers: {
    add: (context) => context.a + context.b,
    subtract: (context) => context.a - context.b
  }
});

// Plugin to add logging
const loggingPlugin = {
  name: 'logging',
  install(api) {
    api.hook('beforeMethod', 'logStart', async (context) => {
      console.log(`Calling ${context.method} with:`, context);
    });
  }
};

calcApi.use(loggingPlugin);
await calcApi.execute('add', { a: 5, b: 3 }); // Logs: Calling add with: {a: 5, b: 3}

// Medium: Versioned validators
const validatorV1 = new Api({
  name: 'validator',
  version: '1.0.0',
  implementers: {
    validateEmail: (context) => {
      return context.email.includes('@');
    }
  }
});

const validatorV2 = new Api({
  name: 'validator', 
  version: '2.0.0',
  implementers: {
    validateEmail: (context) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(context.email);
    },
    validatePhone: (context) => {
      return /^\d{10}$/.test(context.phone);
    }
  }
});

// Use specific version
const v1 = Api.registry.get('validator', '1.0.0');
await v1.execute('validateEmail', { email: 'bad@email' }); // true (simple check)

const v2 = Api.registry.get('validator', '2.0.0');
await v2.execute('validateEmail', { email: 'bad@email' }); // false (regex check)

// Complex: Database abstraction with caching
const dbApi = new Api({
  name: 'database',
  version: '1.0.0',
  implementers: {
    find: async (context, options) => {
      await options.apiInstance.executeHook('beforeFind', context);
      
      // Simulate DB query
      const result = { id: context.id, name: 'User ' + context.id };
      
      context.result = result;
      await options.apiInstance.executeHook('afterFind', context);
      
      return context.result;
    }
  }
});

// Caching plugin
const cachePlugin = {
  name: 'cache',
  install(api) {
    const cache = new Map();
    
    api.hook('beforeFind', 'checkCache', async (context) => {
      const key = `find:${context.id}`;
      if (cache.has(key)) {
        context.result = cache.get(key);
        context.fromCache = true;
        return false; // Stop the chain
      }
    });
    
    api.hook('afterFind', 'saveCache', async (context) => {
      if (!context.fromCache) {
        const key = `find:${context.id}`;
        cache.set(key, context.result);
      }
    });
  }
};

dbApi.use(cachePlugin);

await dbApi.execute('find', { id: 1 }); // Hits "database"
await dbApi.execute('find', { id: 1 }); // Returns from cache

// Complex: Multi-tenant API system
class TenantApi extends Api {
  constructor(tenant, options) {
    super({
      ...options,
      name: `${options.name}:${tenant}`,
      constants: {
        tenant: tenant,
        ...options.constants
      }
    });
  }
}

const tenantA = new TenantApi('companyA', {
  name: 'crm',
  version: '1.0.0',
  constants: {
    maxUsers: 100
  },
  implementers: {
    getQuota: function(context) {
      return this.constants.get('maxUsers');
    }
  }
});

const tenantB = new TenantApi('companyB', {
  name: 'crm',
  version: '1.0.0', 
  constants: {
    maxUsers: 500
  },
  implementers: {
    getQuota: function(context) {
      return this.constants.get('maxUsers');
    }
  }
});

// Each tenant has different limits
await Api.registry.get('crm:companyA').execute('getQuota'); // 100
await Api.registry.get('crm:companyB').execute('getQuota'); // 500

// Advanced: API Gateway with middleware
const gatewayApi = new Api({
  name: 'gateway',
  version: '1.0.0',
  implementers: {
    proxy: async (context, options) => {
      context.startTime = Date.now();
      
      await options.apiInstance.executeHook('beforeProxy', context);
      
      // Simulate proxying to backend
      context.response = { 
        status: 200, 
        data: `Proxied to ${context.backend}` 
      };
      
      await options.apiInstance.executeHook('afterProxy', context);
      
      return context.response;
    }
  }
});

// Rate limiting plugin
const rateLimitPlugin = {
  name: 'rateLimit',
  dependencies: ['auth'], // Must have auth first
  install(api) {
    const limits = new Map();
    
    api.hook('beforeProxy', 'checkLimit', async (context) => {
      const key = context.userId || 'anonymous';
      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window
      
      if (!limits.has(key)) {
        limits.set(key, []);
      }
      
      const requests = limits.get(key).filter(time => time > windowStart);
      
      if (requests.length >= 10) {
        context.response = { status: 429, error: 'Rate limit exceeded' };
        return false; // Stop processing
      }
      
      requests.push(now);
      limits.set(key, requests);
    });
  }
};

// Auth plugin (required by rate limiter)
const authPlugin = {
  name: 'auth',
  install(api) {
    api.hook('beforeProxy', 'authenticate', async (context) => {
      context.userId = context.headers?.userId || null;
    });
  }
};

gatewayApi.use(authPlugin);
gatewayApi.use(rateLimitPlugin);

// First 10 requests work
for (let i = 0; i < 10; i++) {
  await gatewayApi.execute('proxy', { backend: 'service1', headers: { userId: 'user1' } });
}

// 11th request fails with rate limit
await gatewayApi.execute('proxy', { backend: 'service1', headers: { userId: 'user1' } });
// Returns: { status: 429, error: 'Rate limit exceeded' }