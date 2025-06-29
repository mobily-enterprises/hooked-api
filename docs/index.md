---
layout: default
title: Hooked API - Build Extensible APIs with Ease
---

<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5em 2em; border-radius: 8px; margin-bottom: 2em; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <p style="margin: 0; font-size: 1.1em; line-height: 1.6;">
    <strong>A heartfelt thank you to Dario and Daniela Amodei and the entire Anthropic team</strong> for creating transformative AI technology that opens endless possibilities for developers worldwide. Your vision, combined with incredibly accessible pricing, has democratized access to cutting-edge AI and empowered countless innovators to build the future. <em>(No, we weren't asked nor paid in any way for this message - we're just genuinely grateful!)</em>
  </p>
</div>

# Build APIs That Can Be Extended Like Never Before

<div style="text-align: center; margin: 2em 0;">
  <h2 style="font-size: 2.5em; margin: 0; color: #2c3e50;">🪝 Hooked API</h2>
  <p style="font-size: 1.3em; color: #7f8c8d; margin-top: 0.5em;">The extensible API framework for Node.js</p>
</div>

---

## Why Hooked API?

Building APIs is easy. Building APIs that can be **extended**, **customized**, and **enhanced** by your users? That's hard. Until now.

Hooked API is a powerful framework that lets you create APIs with **built-in extensibility**. Your users can hook into any part of your API's lifecycle, add custom functionality through plugins, and organize their code with scopes.

<div style="background: #f8f9fa; padding: 2em; border-radius: 8px; margin: 2em 0;">
  <h3 style="margin-top: 0;">🚀 Key Features</h3>
  
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5em; margin-top: 1.5em;">
    <div>
      <h4>🪝 Powerful Hook System</h4>
      <p>Let users intercept and modify behavior at any point in your API's execution</p>
    </div>
    
    <div>
      <h4>🔌 Plugin Architecture</h4>
      <p>Bundle functionality into reusable plugins with dependencies and lifecycle management</p>
    </div>
    
    <div>
      <h4>📦 Scoped Methods</h4>
      <p>Organize API methods into logical scopes (like database tables or resource types)</p>
    </div>
    
    <div>
      <h4>🛡️ Built-in Security</h4>
      <p>Prototype pollution protection, input validation, and frozen configurations</p>
    </div>
    
    <div>
      <h4>📊 Comprehensive Logging</h4>
      <p>Multi-level logging with custom loggers and performance tracking</p>
    </div>
    
    <div>
      <h4>🔄 Version Management</h4>
      <p>Built-in API registry with semver support for smooth migrations</p>
    </div>
  </div>
</div>

## See It In Action

Here's how simple it is to create an extensible database API:

```javascript
import { Api } from 'hooked-api';

// Create your API
const api = new Api({ name: 'my-db', version: '1.0.0' });

// Add methods that can be hooked
api.customize({
  scopeMethods: {
    get: async ({ params, runHooks, scopeName }) => {
      await runHooks('beforeFetch');
      const data = await db.fetch(scopeName, params.id);
      await runHooks('afterFetch');
      return data;
    }
  }
});

// Users can extend with plugins
api.use({
  name: 'TimestampPlugin',
  install: ({ addHook }) => {
    addHook('afterFetch', 'addTimestamp', {}, ({ context }) => {
      context.record.fetchedAt = new Date();
    });
  }
});

// Create scopes for different resources
api.addScope('users');
api.addScope('posts');

// Use it!
const user = await api.scopes.users.get({ id: 123 });
// user now has fetchedAt timestamp added by the plugin!
```

## Perfect For

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1em; margin: 2em 0;">
  <div style="background: #e8f5e9; padding: 1.5em; border-radius: 6px;">
    <strong>🗄️ Database Abstractions</strong><br>
    Let users customize queries, add computed fields, or implement caching
  </div>
  
  <div style="background: #e3f2fd; padding: 1.5em; border-radius: 6px;">
    <strong>🌐 API Clients</strong><br>
    Allow request/response transformation, retry logic, and custom authentication
  </div>
  
  <div style="background: #fff3e0; padding: 1.5em; border-radius: 6px;">
    <strong>🏗️ Framework Building</strong><br>
    Create frameworks where every aspect can be customized by developers
  </div>
  
  <div style="background: #fce4ec; padding: 1.5em; border-radius: 6px;">
    <strong>🔧 Developer Tools</strong><br>
    Build CLIs and tools that can be extended with community plugins
  </div>
</div>

## What Developers Are Probably Thinking

> "Finally, an API framework that doesn't fight me when I need to add custom behavior. The hook system is brilliant!" - *Senior Developer*

> "We replaced our entire homegrown plugin system with Hooked API. It's more powerful and our code is cleaner." - *Tech Lead*

> "The scope feature is perfect for our multi-tenant application. Each tenant gets their own customized API behavior." - *SaaS Founder*

## Ready to Get Started?

<div style="text-align: center; margin: 3em 0;">
  <a href="{{ './README.html' | relative_url }}" style="display: inline-block; background: #28a745; color: white; padding: 1em 2em; text-decoration: none; border-radius: 6px; font-size: 1.1em;">
    📚 Start with the Documentation
  </a>
</div>

## Documentation

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1em; margin: 2em 0;">
  <a href="{{ './README.html' | relative_url }}" style="display: block; background: #f5f5f5; padding: 1.5em; border-radius: 6px; text-decoration: none; color: inherit; border: 2px solid transparent; transition: all 0.2s;">
    <h3 style="margin-top: 0; color: #0366d6;">📚 Full Documentation</h3>
    <p>Complete guide with examples, from basic usage to advanced patterns</p>
  </a>
  
  <a href="{{ './API.html' | relative_url }}" style="display: block; background: #f5f5f5; padding: 1.5em; border-radius: 6px; text-decoration: none; color: inherit; border: 2px solid transparent; transition: all 0.2s;">
    <h3 style="margin-top: 0; color: #0366d6;">🔧 API Reference</h3>
    <p>Detailed API documentation for all methods, handlers, and options</p>
  </a>
  
  <a href="{{ './CHEATSHEET.html' | relative_url }}" style="display: block; background: #f5f5f5; padding: 1.5em; border-radius: 6px; text-decoration: none; color: inherit; border: 2px solid transparent; transition: all 0.2s;">
    <h3 style="margin-top: 0; color: #0366d6;">⚡ Cheatsheet</h3>
    <p>Quick recipes and code snippets for common tasks</p>
  </a>
</div>

<div style="text-align: center; margin-top: 2em; padding-top: 2em; border-top: 1px solid #e1e4e8;">
  <p style="color: #586069;">
    <strong>MIT Licensed</strong> | Built with ❤️ for the Node.js community
  </p>
</div>