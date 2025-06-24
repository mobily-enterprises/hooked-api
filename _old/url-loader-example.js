import { Api } from './api.js';

// Create the main URL Loader Plugin
const UrlLoaderPlugin = {
  name: 'url-loader',
  dependencies: [],
  install(apiInstance, options, pluginName) {
    const targetUrl = options.url || 'https://example.com';
    
    // Implement the main 'load' method
    apiInstance.implement('load', async (context) => {
      // Pass URL through context for other plugins to access
      context.url = context.url || targetUrl;
      
      // Execute 'beforeFetch' hooks
      context = await apiInstance.executeHook('beforeFetch', context);
      
      // Perform the actual fetch
      console.log(`Fetching URL: ${context.url}`);
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
        console.error('Error fetching URL:', context.error);
      } else {
        console.log('\n=== URL Fetch Results ===');
        console.log(`Status: ${context.status}`);
        console.log(`Content Length: ${context.content?.length || 0} characters`);
        console.log('\nContent Preview:');
        console.log(context.content?.substring(0, 200) + '...\n');
      }
    });
  }
};

// Create a HTML stripper plugin
const HtmlStripperPlugin = {
  name: 'html-stripper',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    // Add a filter to strip HTML tags
    apiInstance.hook('filter', pluginName, 'stripHtml', {}, async (context) => {
      if (context.content && options.stripHtml !== false) {
        // Simple HTML tag removal
        context.originalContent = context.content;
        context.content = context.content.replace(/<[^>]*>/g, '');
        context.content = context.content.replace(/\s+/g, ' ').trim();
        console.log('HTML tags stripped');
      }
    });
  }
};

// Create a content highlighter plugin
const HighlighterPlugin = {
  name: 'highlighter',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    const keywords = options.keywords || [];
    
    // Add keywords as a constant
    apiInstance.addConstant('highlightKeywords', keywords);
    
    // Add a filter to highlight keywords
    apiInstance.hook('filter', pluginName, 'highlightKeywords', 
      { afterPlugin: 'html-stripper' }, // Run after HTML stripping
      async (context) => {
        if (context.content && keywords.length > 0) {
          keywords.forEach(keyword => {
            const regex = new RegExp(`(${keyword})`, 'gi');
            context.content = context.content.replace(regex, '***$1***');
          });
          console.log(`Highlighted keywords: ${keywords.join(', ')}`);
        }
      }
    );
    
    // Override the display to show highlighted content
    apiInstance.hook('display', pluginName, 'highlightedDisplay', 
      { afterFunction: 'defaultDisplay' }, 
      async (context) => {
        if (keywords.length > 0 && context.content) {
          console.log('\n=== Highlighted Content ===');
          // Show first 500 chars with highlights
          const preview = context.content.substring(0, 500);
          console.log(preview + '...\n');
        }
      }
    );
  }
};

// Create a word counter plugin
const WordCounterPlugin = {
  name: 'word-counter',
  dependencies: ['url-loader'],
  install(apiInstance, options, pluginName) {
    // Add word counting after filtering
    apiInstance.hook('afterFilter', pluginName, 'countWords', {}, async (context) => {
      if (context.content) {
        const words = context.content.split(/\s+/).filter(word => word.length > 0);
        context.wordCount = words.length;
        
        // Calculate word frequency if requested
        if (options.calculateFrequency) {
          const frequency = {};
          words.forEach(word => {
            const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleaned) {
              frequency[cleaned] = (frequency[cleaned] || 0) + 1;
            }
          });
          
          // Get top 10 most frequent words
          context.topWords = Object.entries(frequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        }
      }
    });
    
    // Add display for word count
    apiInstance.hook('display', pluginName, 'wordCountDisplay', 
      { afterFunction: 'defaultDisplay' }, 
      async (context) => {
        if (context.wordCount) {
          console.log(`\n=== Word Statistics ===`);
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

// Example usage
async function example1() {
  console.log('=== Example 1: Basic URL Loading ===\n');
  
  // Create an API instance for web scraping
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '1.0.0'
  });
  
  // Add a 'pages' resource
  webApi.addResource('pages');
  
  // Install the URL loader plugin
  webApi.use(UrlLoaderPlugin, {
    url: 'https://www.example.com'
  });
  
  // Load the URL
  await webApi.instanceResources.pages.load();
}

async function example2() {
  console.log('\n\n=== Example 2: With HTML Stripping ===\n');
  
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '2.0.0'
  });
  
  webApi.addResource('pages');
  
  // Install plugins
  webApi.use(UrlLoaderPlugin, {
    url: 'https://www.example.com'
  });
  webApi.use(HtmlStripperPlugin);
  
  await webApi.instanceResources.pages.load();
}

async function example3() {
  console.log('\n\n=== Example 3: Full Featured with Highlighting and Word Count ===\n');
  
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '3.0.0'
  });
  
  webApi.addResource('pages');
  
  // Install all plugins
  webApi.use(UrlLoaderPlugin, {
    url: 'https://www.example.com'
  });
  webApi.use(HtmlStripperPlugin);
  webApi.use(HighlighterPlugin, {
    keywords: ['example', 'domain', 'information']
  });
  webApi.use(WordCounterPlugin, {
    calculateFrequency: true
  });
  
  await webApi.instanceResources.pages.load();
}

// Custom filter plugin example
async function example4() {
  console.log('\n\n=== Example 4: Custom Filter Plugin ===\n');
  
  // Create a custom filter that extracts only links
  const LinkExtractorPlugin = {
    name: 'link-extractor',
    dependencies: ['url-loader'],
    install(apiInstance, options, pluginName) {
      // Add a hook that runs before HTML stripping
      apiInstance.hook('beforeFilter', pluginName, 'extractLinks', {}, async (context) => {
        if (context.content) {
          const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
          const links = [];
          let match;
          
          while ((match = linkRegex.exec(context.content)) !== null) {
            links.push(match[1]);
          }
          
          context.extractedLinks = links;
          console.log(`Extracted ${links.length} links`);
        }
      });
      
      // Add display for links
      apiInstance.hook('display', pluginName, 'linksDisplay', 
        { afterFunction: 'defaultDisplay' }, 
        async (context) => {
          if (context.extractedLinks && context.extractedLinks.length > 0) {
            console.log('\n=== Extracted Links ===');
            context.extractedLinks.slice(0, 10).forEach(link => {
              console.log(`  - ${link}`);
            });
            if (context.extractedLinks.length > 10) {
              console.log(`  ... and ${context.extractedLinks.length - 10} more`);
            }
          }
        }
      );
    }
  };
  
  const webApi = new Api({
    name: 'WEB_SCRAPER_API',
    version: '4.0.0'
  });
  
  webApi.addResource('pages');
  
  webApi.use(UrlLoaderPlugin, {
    url: 'https://www.example.com'
  });
  webApi.use(LinkExtractorPlugin);
  webApi.use(HtmlStripperPlugin);
  
  await webApi.instanceResources.pages.load();
}

// Run examples (uncomment to test)
// Note: These will actually try to fetch from example.com
// example1().catch(console.error);
// example2().catch(console.error);
// example3().catch(console.error);
// example4().catch(console.error);

// Export for use in other files
export { UrlLoaderPlugin, HtmlStripperPlugin, HighlighterPlugin, WordCounterPlugin };