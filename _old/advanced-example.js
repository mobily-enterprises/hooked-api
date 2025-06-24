import { Api } from './api.js';

// Example showing advanced features: resource-specific methods, multiple APIs, and version compatibility

// Create a caching plugin that adds resource-specific caching
const CachingPlugin = {
  name: 'caching',
  dependencies: [],
  install(apiInstance, options, pluginName) {
    const cache = new Map();
    const ttl = options.ttl || 60000; // Default 60 seconds
    
    // Add cache management methods
    apiInstance.implement('clearCache', async (context) => {
      const resourceName = context.resourceName;
      if (resourceName) {
        const resourceCache = cache.get(resourceName);
        if (resourceCache) {
          resourceCache.clear();
          console.log(`Cache cleared for resource: ${resourceName}`);
        }
      } else {
        cache.clear();
        console.log('All caches cleared');
      }
    });
    
    // Hook into any 'fetch' operations to add caching
    apiInstance.hook('beforeFetch', pluginName, 'checkCache', {}, async (context) => {
      const resourceName = context.resourceName;
      const cacheKey = context.cacheKey || context.url || 'default';
      
      if (!cache.has(resourceName)) {
        cache.set(resourceName, new Map());
      }
      
      const resourceCache = cache.get(resourceName);
      const cached = resourceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < ttl)) {
        console.log(`Cache hit for ${resourceName}:${cacheKey}`);
        context.content = cached.content;
        context.fromCache = true;
        return false; // Stop the chain - we have cached data
      }
      
      console.log(`Cache miss for ${resourceName}:${cacheKey}`);
    });
    
    apiInstance.hook('afterFetch', pluginName, 'updateCache', {}, async (context) => {
      if (!context.fromCache && context.content) {
        const resourceName = context.resourceName;
        const cacheKey = context.cacheKey || context.url || 'default';
        const resourceCache = cache.get(resourceName);
        
        resourceCache.set(cacheKey, {
          content: context.content,
          timestamp: Date.now()
        });
        console.log(`Cached ${resourceName}:${cacheKey}`);
      }
    });
  }
};

// Create a REST API client
async function createRestApiExample() {
  console.log('=== REST API Example ===\n');
  
  // Create a REST API with CRUD operations
  const restApi = new Api({
    name: 'REST_API',
    version: '1.0.0',
    constants: {
      baseUrl: 'https://jsonplaceholder.typicode.com'
    },
    implementers: {
      get: async (context) => {
        const { resourceName, id } = context;
        const baseUrl = context.apiInstance.constants.get('baseUrl');
        const url = `${baseUrl}/${resourceName}${id ? `/${id}` : ''}`;
        
        context.url = url;
        context = await context.apiInstance.executeHook('beforeFetch', context);
        
        if (!context.fromCache) {
          console.log(`GET ${url}`);
          const response = await fetch(url);
          context.content = await response.json();
        }
        
        context = await context.apiInstance.executeHook('afterFetch', context);
        return context.content;
      },
      
      post: async (context) => {
        const { resourceName, data } = context;
        const baseUrl = context.apiInstance.constants.get('baseUrl');
        const url = `${baseUrl}/${resourceName}`;
        
        console.log(`POST ${url}`, data);
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' }
        });
        
        return await response.json();
      },
      
      update: async (context) => {
        const { resourceName, id, data } = context;
        const baseUrl = context.apiInstance.constants.get('baseUrl');
        const url = `${baseUrl}/${resourceName}/${id}`;
        
        console.log(`PUT ${url}`, data);
        const response = await fetch(url, {
          method: 'PUT',
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' }
        });
        
        return await response.json();
      },
      
      delete: async (context) => {
        const { resourceName, id } = context;
        const baseUrl = context.apiInstance.constants.get('baseUrl');
        const url = `${baseUrl}/${resourceName}/${id}`;
        
        console.log(`DELETE ${url}`);
        const response = await fetch(url, { method: 'DELETE' });
        return response.ok;
      }
    }
  });
  
  // Add resources with resource-specific methods
  restApi.addResource('posts', 
    { endpoint: 'posts' },
    {}, // No resource-specific hooks
    { // Resource-specific methods
      getByUser: async (context) => {
        const userId = context.userId;
        context.id = null; // Clear ID to get all posts
        const posts = await context.apiInstance.execute('get', context);
        return posts.filter(post => post.userId === userId);
      },
      
      getWithComments: async (context) => {
        const postId = context.id;
        
        // Get the post
        const post = await context.apiInstance.execute('get', context);
        
        // Get comments for this post
        const commentsContext = {
          resourceName: 'comments',
          id: null
        };
        const allComments = await context.apiInstance.execute('get', commentsContext);
        post.comments = allComments.filter(c => c.postId === postId);
        
        return post;
      }
    },
    { // Resource-specific constants
      maxTitleLength: 100,
      allowedTags: ['tech', 'news', 'tutorial']
    }
  );
  
  restApi.addResource('users');
  restApi.addResource('comments');
  
  // Install caching plugin
  restApi.use(CachingPlugin, { ttl: 30000 });
  
  // Use the API
  console.log('\n1. Getting all posts:');
  const posts = await restApi.instanceResources.posts.get();
  console.log(`Retrieved ${posts.length} posts\n`);
  
  console.log('2. Getting posts by user 1:');
  const userPosts = await restApi.instanceResources.posts.getByUser({ userId: 1 });
  console.log(`User 1 has ${userPosts.length} posts\n`);
  
  console.log('3. Getting post 1 with comments:');
  const postWithComments = await restApi.instanceResources.posts.getWithComments({ id: 1 });
  console.log(`Post "${postWithComments.title}" has ${postWithComments.comments.length} comments\n`);
  
  console.log('4. Creating a new post:');
  const newPost = await restApi.instanceResources.posts.post({
    data: {
      title: 'Test Post',
      body: 'This is a test post',
      userId: 1
    }
  });
  console.log(`Created post with ID: ${newPost.id}\n`);
  
  console.log('5. Testing cache - getting all posts again:');
  await restApi.instanceResources.posts.get();
  
  console.log('\n6. Clearing cache for posts:');
  await restApi.instanceResources.posts.clearCache();
  
  console.log('\n7. Accessing resource constants:');
  console.log(`Max title length: ${restApi.instanceResources.posts.maxTitleLength}`);
  console.log(`Allowed tags: ${restApi.instanceResources.posts.allowedTags.join(', ')}`);
}

// Example with multiple API versions
async function multiVersionExample() {
  console.log('\n\n=== Multi-Version API Example ===\n');
  
  // Create v1.0.0 of an API
  const apiV1 = new Api({
    name: 'USER_API',
    version: '1.0.0',
    implementers: {
      authenticate: async (context) => {
        console.log('v1.0.0: Basic authentication');
        return { token: 'basic-token', version: '1.0.0' };
      }
    }
  });
  
  apiV1.addResource('auth');
  
  // Create v2.0.0 with enhanced features
  const apiV2 = new Api({
    name: 'USER_API',
    version: '2.0.0',
    implementers: {
      authenticate: async (context) => {
        console.log('v2.0.0: OAuth authentication with MFA');
        return { token: 'oauth-token', version: '2.0.0', mfa: true };
      }
    }
  });
  
  apiV2.addResource('auth');
  
  // Access specific versions
  console.log('1. Using latest version:');
  const latestAuth = await Api.resources.auth.authenticate();
  console.log('Result:', latestAuth);
  
  console.log('\n2. Using v1.0.0 specifically:');
  const v1Auth = await Api.resources.version('1.0.0').auth.authenticate();
  console.log('Result:', v1Auth);
  
  console.log('\n3. Using version range ^1.0.0:');
  const v1RangeAuth = await Api.resources.version('^1.0.0').auth.authenticate();
  console.log('Result:', v1RangeAuth);
  
  console.log('\n4. List all registered APIs:');
  console.log(Api.registry.list());
  
  console.log('\n5. Get all versions of USER_API:');
  console.log(Api.registry.versions('USER_API'));
}

// Run examples (uncomment to test)
// Note: The REST API example will actually fetch from jsonplaceholder.typicode.com
// createRestApiExample().catch(console.error);
// multiVersionExample().catch(console.error);

export { CachingPlugin };