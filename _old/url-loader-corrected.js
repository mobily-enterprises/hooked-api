import { Api } from './api.js';

// Corrected URL Loader Plugin - URLs are defined per resource, not per plugin
const UrlLoaderPlugin = {
  name: 'url-loader',
  dependencies: [],
  install(apiInstance, options, pluginName) {
    // Implement the main 'load' method that works with any resource
    apiInstance.implement('load', async (context) => {
      // Get the URL from the resource's options
      const resourceName = context.resourceName;
      const resourceConfig = apiInstance._resources.get(resourceName);
      const url = context.url || resourceConfig?.options?.url;
      
      if (!url) {
        throw new Error(`No URL specified for resource '${resourceName}'`);
      }
      
      context.url = url;
      
      // Execute 'beforeFetch' hooks
      context = await apiInstance.executeHook('beforeFetch', context);
      
      if (!context.fromCache) {
        // Perform the actual fetch
        console.log(`Fetching ${resourceName}: ${context.url}`);
        try {
          const response = await fetch(context.url);
          context.rawResponse = response;
          context.content = await response.text();
          context.headers = Object.fromEntries(response.headers.entries());
          context.status = response.status;
        } catch (error) {
          context.error = error;
          context.content = null;
        }
      }
      
      // Execute 'afterFetch' hooks
      context = await apiInstance.executeHook('afterFetch', context);
      
      // Execute filtering hooks
      context = await apiInstance.executeHook('beforeFilter', context);
      context = await apiInstance.executeHook('filter', context);
      context = await apiInstance.executeHook('afterFilter', context);
      
      // Execute display hooks
      context = await apiInstance.executeHook('beforeDisplay', context);
      context = await apiInstance.executeHook('display', context);
      
      return context;
    });
    
    // Add a default display hook
    apiInstance.hook('display', pluginName, 'defaultDisplay', {}, async (context) => {
      if (context.error) {
        console.error(`Error fetching ${context.resourceName}:`, context.error);
      } else {
        console.log(`\n=== ${context.resourceName} Fetch Results ===`);
        console.log(`URL: ${context.url}`);
        console.log(`Status: ${context.status}`);
        console.log(`Content Length: ${context.content?.length || 0} characters`);
        console.log('\nContent Preview:');
        console.log(context.content?.substring(0, 200) + '...\n');
      }
    });
  }
};

// Corrected usage examples
async function example1() {
  console.log('=== Example 1: Basic URL Loading ===\n');
  
  // Create an API instance for web scraping
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '1.0.0'
  });

  // Install the URL loader plugin (provides the 'load' method)
  webApi.use(UrlLoaderPlugin);

  // Add resources - each with their own URL
  webApi.addResource('exampleDotCom', {
    url: 'https://www.example.com'
  });
  
  webApi.addResource('googleHomepage', {
    url: 'https://www.google.com'
  });
  
  webApi.addResource('githubApi', {
    url: 'https://api.github.com'
  });
  
  // Load different URLs through their resources
  await webApi.instanceResources.exampleDotCom.load();
  await webApi.instanceResources.googleHomepage.load();
  await webApi.instanceResources.githubApi.load();
}

async function example2() {
  console.log('\n\n=== Example 2: With Multiple Plugins ===\n');
  
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '2.0.0'
  });

  // Install plugins
  webApi.use(UrlLoaderPlugin);
  webApi.use(HtmlStripperPlugin);
  webApi.use(WordCounterPlugin, { calculateFrequency: true });
  
  // Add multiple news sites as resources
  webApi.addResource('bbcNews', {
    url: 'https://www.bbc.com/news'
  });
  
  webApi.addResource('cnnNews', {
    url: 'https://www.cnn.com'
  });
  
  // Each resource uses the same 'load' method but fetches its own URL
  await webApi.instanceResources.bbcNews.load();
  await webApi.instanceResources.cnnNews.load();
}

async function example3() {
  console.log('\n\n=== Example 3: Dynamic URLs ===\n');
  
  const webApi = new Api({
    name: 'API_CLIENT',
    version: '1.0.0'
  });

  webApi.use(UrlLoaderPlugin);
  
  // Add API endpoint resources
  webApi.addResource('users', {
    url: 'https://jsonplaceholder.typicode.com/users'
  });
  
  webApi.addResource('posts', {
    url: 'https://jsonplaceholder.typicode.com/posts'
  });
  
  // Can also override URL at call time
  await webApi.instanceResources.users.load();
  
  // Override the resource's default URL for a specific call
  await webApi.instanceResources.users.load({
    url: 'https://jsonplaceholder.typicode.com/users/1'
  });
}

// Resource-specific load methods
async function example4() {
  console.log('\n\n=== Example 4: Resource-Specific Behavior ===\n');
  
  const webApi = new Api({
    name: 'SMART_SCRAPER',
    version: '1.0.0'
  });

  webApi.use(UrlLoaderPlugin);
  
  // Add a resource with custom load behavior
  webApi.addResource('rssFeeds', 
    {
      url: 'https://example.com/feed.xml',
      type: 'rss'
    },
    {}, // no special hooks
    {
      // Resource-specific method that parses RSS after loading
      loadAndParse: async function(context) {
        // First, use the standard load
        await context.apiInstance.execute('load', context);
        
        if (context.content && !context.error) {
          // Add RSS-specific parsing
          console.log('Parsing RSS feed...');
          // In real implementation, you'd parse the XML here
          context.items = []; // Parsed RSS items would go here
        }
        
        return context;
      }
    }
  );
  
  // Standard load
  await webApi.instanceResources.rssFeeds.load();
  
  // Or use the enhanced version
  await webApi.instanceResources.rssFeeds.loadAndParse();
}

// Plugin that adds retry logic for all resources
const RetryPlugin = {
  name: 'retry',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    
    apiInstance.hook('beforeFetch', pluginName, 'initRetry', {}, async (context) => {
      context.retryCount = 0;
      context.maxRetries = maxRetries;
    });
    
    apiInstance.hook('afterFetch', pluginName, 'checkRetry', {}, async (context) => {
      if (context.error && context.retryCount < context.maxRetries) {
        context.retryCount++;
        console.log(`Retry ${context.retryCount}/${context.maxRetries} for ${context.resourceName}`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        // Clear error and try again
        delete context.error;
        delete context.content;
        
        // Re-execute fetch by going back through the chain
        return await apiInstance.executeHook('beforeFetch', context);
      }
    });
  }
};

// Export cleaned up plugins
export { UrlLoaderPlugin, RetryPlugin };

// The other plugins would also be updated to work with this pattern
const HtmlStripperPlugin = {
  name: 'html-stripper',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    apiInstance.hook('filter', pluginName, 'stripHtml', {}, async (context) => {
      if (context.content && options.stripHtml !== false) {
        context.originalContent = context.content;
        context.content = context.content.replace(/<[^>]*>/g, '');
        context.content = context.content.replace(/\s+/g, ' ').trim();
        console.log(`HTML stripped from ${context.resourceName}`);
      }
    });
  }
};

const WordCounterPlugin = {
  name: 'word-counter',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    apiInstance.hook('afterFilter', pluginName, 'countWords', {}, async (context) => {
      if (context.content) {
        const words = context.content.split(/\s+/).filter(word => word.length > 0);
        context.wordCount = words.length;
        console.log(`${context.resourceName}: ${context.wordCount} words`);
        
        if (options.calculateFrequency) {
          const frequency = {};
          words.forEach(word => {
            const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleaned) {
              frequency[cleaned] = (frequency[cleaned] || 0) + 1;
            }
          });
          
          context.topWords = Object.entries(frequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        }
      }
    });
    
    apiInstance.hook('display', pluginName, 'wordCountDisplay', 
      { afterFunction: 'defaultDisplay' }, 
      async (context) => {
        if (context.wordCount) {
          console.log(`\n=== Word Statistics for ${context.resourceName} ===`);
          console.log(`Total words: ${context.wordCount}`);
          
          if (context.topWords) {
            console.log('\nTop 10 words:');
            context.topWords.forEach(([word, count]) => {
              console.log(`  ${word}: ${count}`);
            });
          }
        }
      }
    );
  }
};