import { Api } from './api.js';

// Example showing the proper use of constants - they're for resource access, not plugin communication

// Create an API for a blog system
const blogApi = new Api({
  name: 'BLOG_API',
  version: '1.0.0',
  // API-level constants accessible from any resource
  constants: {
    maxPostLength: 10000,
    allowedImageTypes: ['jpg', 'png', 'gif'],
    defaultAuthor: 'Anonymous'
  },
  implementers: {
    validate: async (context) => {
      const { content, resourceName } = context;
      
      if (resourceName === 'posts' && content) {
        // Access constants through the API instance
        const maxLength = context.apiInstance.constants.get('maxPostLength');
        if (content.length > maxLength) {
          throw new Error(`Post content exceeds maximum length of ${maxLength} characters`);
        }
      }
      
      return true;
    }
  }
});

// Add resources with resource-specific constants
blogApi.addResource('posts', 
  {},
  {},
  {
    // Resource-specific methods
    publish: async (context) => {
      // Can access both API-level and resource-level constants
      console.log(`Publishing post by ${context.author || blogApi.constants.get('defaultAuthor')}`);
      
      // Validate before publishing
      await context.apiInstance.execute('validate', context);
      
      // Resource-specific constants are accessed through the resource proxy
      const draftTimeout = blogApi.instanceResources.posts.draftTimeout;
      console.log(`Draft timeout: ${draftTimeout}ms`);
      
      return { published: true, timestamp: Date.now() };
    }
  },
  {
    // Resource-specific constants - these shadow API-level constants with same name
    draftTimeout: 3600000, // 1 hour in ms
    allowedCategories: ['tech', 'lifestyle', 'news'],
    maxTitleLength: 200
  }
);

blogApi.addResource('comments',
  {},
  {},
  {},
  {
    // Comments have different constraints than posts
    maxLength: 500,
    requiresModeration: true,
    allowedReactions: ['like', 'love', 'laugh', 'wow']
  }
);

// Plugin that uses constants properly
const ModerationPlugin = {
  name: 'moderation',
  install(apiInstance, options, pluginName) {
    // Add hooks that check resource-specific moderation rules
    apiInstance.hook('beforePublish', pluginName, 'checkModeration', {}, async (context) => {
      const { resourceName, content } = context;
      
      // Access resource-specific constants through the context
      if (resourceName === 'comments') {
        // This will get the resource-specific constant if it exists
        const requiresModeration = apiInstance._resources.get(resourceName).constants.get('requiresModeration');
        
        if (requiresModeration) {
          console.log('Comment requires moderation before publishing');
          context.status = 'pending_moderation';
        }
      }
    });
  }
};

// Usage examples
async function demonstrateConstants() {
  console.log('=== Constants Example ===\n');
  
  // Install moderation plugin
  blogApi.use(ModerationPlugin);
  
  // 1. Access API-level constants
  console.log('1. API-level constants:');
  console.log(`Max post length: ${blogApi.constants.get('maxPostLength')}`);
  console.log(`Default author: ${blogApi.constants.get('defaultAuthor')}`);
  console.log(`Allowed image types: ${blogApi.constants.get('allowedImageTypes').join(', ')}`);
  
  // 2. Access resource-specific constants through resource proxy
  console.log('\n2. Resource-specific constants:');
  console.log(`Posts - Max title length: ${blogApi.instanceResources.posts.maxTitleLength}`);
  console.log(`Posts - Draft timeout: ${blogApi.instanceResources.posts.draftTimeout}`);
  console.log(`Comments - Max length: ${blogApi.instanceResources.comments.maxLength}`);
  console.log(`Comments - Allowed reactions: ${blogApi.instanceResources.comments.allowedReactions.join(', ')}`);
  
  // 3. Constants in action
  console.log('\n3. Publishing a post:');
  await blogApi.instanceResources.posts.publish({
    content: 'This is a great blog post about API design.',
    author: 'John Doe'
  });
  
  console.log('\n4. Publishing without author (uses default):');
  await blogApi.instanceResources.posts.publish({
    content: 'Another interesting post.'
  });
  
  // 5. Try to violate constraints
  console.log('\n5. Testing validation:');
  try {
    const longContent = 'x'.repeat(15000);
    await blogApi.instanceResources.posts.publish({
      content: longContent
    });
  } catch (error) {
    console.log(`Validation error: ${error.message}`);
  }
}

// Example showing constants precedence
async function demonstratePrecedence() {
  console.log('\n\n=== Constants Precedence Example ===\n');
  
  const api = new Api({
    name: 'PRECEDENCE_API',
    version: '1.0.0',
    constants: {
      timeout: 5000,
      retries: 3
    },
    implementers: {
      fetchData: async (context) => {
        // This will get the resource-specific timeout if accessing through a resource,
        // or the API-level timeout if called directly
        console.log(`Using timeout: ${context.apiInstance.constants.get('timeout')}ms`);
        return { data: 'fetched' };
      }
    }
  });
  
  api.addResource('fastEndpoint', {}, {}, {}, {
    timeout: 1000  // Override timeout for this resource
  });
  
  api.addResource('slowEndpoint', {}, {}, {}, {
    timeout: 30000  // Override timeout for this resource
  });
  
  console.log('1. Accessing through resources (gets resource-specific constant):');
  console.log(`Fast endpoint timeout: ${api.instanceResources.fastEndpoint.timeout}ms`);
  console.log(`Slow endpoint timeout: ${api.instanceResources.slowEndpoint.timeout}ms`);
  
  console.log('\n2. Direct API access (gets API-level constant):');
  console.log(`API default timeout: ${api.constants.get('timeout')}ms`);
  
  console.log('\n3. Resource without override (falls back to API-level):');
  api.addResource('normalEndpoint');
  console.log(`Normal endpoint timeout: ${api.instanceResources.normalEndpoint.timeout}ms`);
}

// Run examples
// demonstrateConstants().catch(console.error);
// demonstratePrecedence().catch(console.error);

export { blogApi, ModerationPlugin };