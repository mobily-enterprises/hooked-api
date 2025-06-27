import semver from 'semver'

let globalRegistry = new Map()

export class Api {
  constructor(options = {}) {
    this.options = {
      name: null,
      version: '1.0.0',
      ...options
    }

    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      throw new Error('API instance must have a non-empty "name" property.');
    }
    if (!semver.valid(this.options.version)) {
      throw new Error(`Invalid version format '${this.options.version}' for API '${this.options.name}'.`);
    }

    // All internal state with underscore prefix
    this._hooks = new Map()
    this._vars = new Map()
    this._helpers = new Map()
    this._apiMethods = new Map()
    this._resourceMethods = new Map() // New: methods that can only be called on resources
    this._installedPlugins = new Set()
    this._resources = new Map()
    // Store API options (will be frozen when building contexts)
    this._apiOptions = { ...this.options }
    this._pluginOptions = {} // Mutable object for plugin options
    this._isRunningHooks = false
    
    // Create proxy objects for vars and helpers (only for internal use)
    this._varsProxy = new Proxy({}, {
      get: (target, prop) => this._vars.get(prop),
      set: (target, prop, value) => {
        this._vars.set(prop, value);
        return true;
      }
    })
    this._helpersProxy = new Proxy({}, {
      get: (target, prop) => this._helpers.get(prop),
      set: (target, prop, value) => {
        this._helpers.set(prop, value);
        return true;
      }
    })
    
    // Create proxy for api.resources.resourceName.methodName() syntax
    this.resources = new Proxy({}, {
      get: (target, resourceName) => {
        // Prevent prototype pollution and symbol-based bypasses
        if (typeof resourceName === 'symbol' || resourceName === 'constructor' || resourceName === '__proto__') {
          return undefined;
        }
        
        if (!this._resources.has(resourceName)) return undefined;
        
        // Return another proxy for the methods
        return new Proxy((...args) => {
          throw new Error(`Direct resource call not supported. Use api.resources.${resourceName}.methodName() instead`);
        }, {
          get: (target, prop) => {
            // Only non-numeric string props, so that resources.users[123] returns undefined
            if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
              const resource = this._resources.get(resourceName);
              if (!resource) {
                return undefined;
              }
              
              // Find handler - check resource-specific methods first, then global resource methods
              const handler = resource._resourceMethods?.get(prop) || this._resourceMethods.get(prop);
              if (!handler) {
                return undefined; // No method found
              }
              
              return async (params = {}) => {
                // Create a mutable context for this method call
                const context = {};
                
                // Get the resource-aware context
                const resourceContext = this._buildResourceContext(resourceName);
                
                return await handler({ 
                  // User data
                  params,
                  context,
                  
                  // Data access (resource-aware)
                  vars: resourceContext.vars,
                  helpers: resourceContext.helpers,
                  resources: resourceContext.resources,
                  
                  // Capabilities
                  runHooks: resourceContext.runHooks,
                  
                  // Metadata
                  name: prop,
                  apiOptions: resourceContext.apiOptions,
                  pluginOptions: resourceContext.pluginOptions,
                  resourceOptions: resourceContext.resourceOptions,
                  resource: resourceName
                });
              };
            }
            return target[prop];
          },
          apply: (target, thisArg, args) => {
            return target(...args);
          }
        });
      }
    });

    // Register this API instance
    this._register()
    
    // Keep use and customize as public methods
    this.use = this.use.bind(this);
    this.customize = this.customize.bind(this);
    
    // Return a proxy to enable api.methodName() syntax
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Check apiMethods first
        if (target._apiMethods.has(prop)) {
          return async (params = {}) => {
            const handler = target._apiMethods.get(prop);
            
            // Create a mutable context for this method call
            const context = {};
            
            // Create flattened handler context
            return await handler({ 
              // User data
              params,
              context,
              
              // Data access
              vars: target._varsProxy,
              helpers: target._helpersProxy,
              resources: target.resources,
              
              // Capabilities
              runHooks: target._runHooks.bind(target),
              
              // Metadata
              name: prop,
              apiOptions: Object.freeze({ ...target._apiOptions }),
              pluginOptions: Object.freeze({ ...target._pluginOptions })
              // No resource parameter or resourceOptions for global methods
            });
          };
        }
        // Fall back to actual properties
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  _register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    if (globalRegistry.get(name).has(version)) {
      throw new Error(`API '${name}' version '${version}' is already registered.`);
    }

    globalRegistry.get(name).set(version, this)
    return this
  }

  static registry = {
    get(apiName, version = 'latest') {
      const versions = globalRegistry.get(apiName)
      if (!versions) return null;

      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version);
      }

      // Special case for 'latest'
      if (version === 'latest') {
        const sortedVersions = Array.from(versions.entries())
          .sort(([a], [b]) => semver.compare(b, a));
        return sortedVersions[0]?.[1] || null;
      }

      // Handle empty string explicitly
      if (version === '') {
        return null;
      }
      
      // Validate the version string
      if (!semver.validRange(version)) {
        return null;
      }

      // Check if this is an exact version request
      if (semver.valid(version)) {
        // Exact version was requested but doesn't exist
        return null;
      }

      // Handle range queries
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a));
      
      for (const [ver, api] of sortedVersions) {
        if (semver.satisfies(ver, version)) {
          return api;
        }
      }

      return null;
    },

    find(apiName, version = 'latest') {
      return this.get(apiName, version);
    },

    list() {
      const registry = {}
      for (const [apiName, versionsMap] of globalRegistry) {
        registry[apiName] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    has(apiName, version) {
      if (!apiName) return false;
      const versions = globalRegistry.get(apiName);
      if (!versions) return false;
      return version ? versions.has(version) : versions.size > 0;
    },

    versions(apiName) {
      const versions = globalRegistry.get(apiName);
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : [];
    }
  }

  _addHook(hookName, pluginName, functionName, hookAddOptions, handler) {
    if (this._isRunningHooks) {
      throw new Error('Cannot add hooks while hooks are executing');
    }
    if (!pluginName?.trim()) throw new Error(`Hook '${hookName}' requires a valid pluginName`)
    if (!functionName?.trim()) throw new Error(`Hook '${hookName}' requires a valid functionName`)
    
    // Allow handler to be the 4th parameter (with hookAddOptions) or 3rd parameter (without)
    if (typeof hookAddOptions === 'function' && handler === undefined) {
      handler = hookAddOptions;
      hookAddOptions = {};
    }
    
    if (typeof handler !== 'function') throw new Error(`Hook '${hookName}' handler must be a function`)

    const placements = [hookAddOptions.beforePlugin, hookAddOptions.afterPlugin, hookAddOptions.beforeFunction, hookAddOptions.afterFunction].filter(Boolean);
    if (placements.length > 1) {
      throw new Error(`Hook '${hookName}' can only specify one placement parameter`)
    }

    if (!this._hooks.has(hookName)) {
      this._hooks.set(hookName, [])
    }
    
    const handlers = this._hooks.get(hookName)
    const entry = { handler, pluginName, functionName }

    if (placements.length === 0) {
      handlers.push(entry)
      return this
    }

    const findIndex = (arr, key, value) => arr.findIndex(h => h[key] === value)
    const findLastIndex = (arr, key, value) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i][key] === value) return i
      }
      return -1
    }

    let index = -1
    if (hookAddOptions.beforePlugin) {
      index = findIndex(handlers, 'pluginName', hookAddOptions.beforePlugin)
    } else if (hookAddOptions.afterPlugin) {
      index = findLastIndex(handlers, 'pluginName', hookAddOptions.afterPlugin)
      if (index !== -1) index++
    } else if (hookAddOptions.beforeFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.beforeFunction)
    } else if (hookAddOptions.afterFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.afterFunction)
      if (index !== -1) index++
    }

    if (index === -1) {
      // Warn about missing placement target and add to end
      console.warn(`Hook '${hookName}' placement target not found. Adding to end of hook list.`)
      handlers.push(entry)
    } else {
      handlers.splice(index, 0, entry)
    }
    return this
  }

  _buildResourceContext(resourceName) {
    const resourceConfig = this._resources.get(resourceName);
    if (!resourceConfig) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    
    // Merge vars: resource vars take precedence
    const mergedVars = new Map([
      ...this._vars,
      ...resourceConfig._vars
    ]);
    const varsProxy = new Proxy({}, {
      get: (target, prop) => mergedVars.get(prop),
      set: (target, prop, value) => {
        mergedVars.set(prop, value);
        return true;
      }
    });
    
    // Merge helpers: resource helpers take precedence
    const mergedHelpers = new Map([
      ...this._helpers,
      ...resourceConfig._helpers
    ]);
    const helpersProxy = new Proxy({}, {
      get: (target, prop) => mergedHelpers.get(prop),
      set: (target, prop, value) => {
        mergedHelpers.set(prop, value);
        return true;
      }
    });
    
    // Keep options separate and frozen
    
    // Return flattened context for resource handlers
    return {
      vars: varsProxy,
      helpers: helpersProxy,
      resources: this.resources,
      runHooks: (name, context) => this._runHooks(name, context, resourceName),
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions }),
      resourceOptions: resourceConfig.options
    };
  }
  
  _buildGlobalContext() {
    // Return flattened context for global handlers
    return {
      vars: this._varsProxy,
      helpers: this._helpersProxy,
      resources: this.resources,
      runHooks: this._runHooks.bind(this),
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions })
    };
  }

  async _runHooks(name, context, resource = null) {
    const handlers = this._hooks.get(name) || []
    const handlerContext = resource ? this._buildResourceContext(resource) : this._buildGlobalContext();
    
    this._isRunningHooks = true;
    try {
      for (const { handler, pluginName, functionName } of handlers) {
        // Flatten the handler parameters
        const result = await handler({ 
          // User data
          params: {},
          context,
          
          // Data access
          vars: handlerContext.vars,
          helpers: handlerContext.helpers,
          resources: handlerContext.resources,
          
          // Capabilities
          runHooks: handlerContext.runHooks,
          
          // Metadata
          name,
          apiOptions: handlerContext.apiOptions,
          pluginOptions: handlerContext.pluginOptions,
          resourceOptions: handlerContext.resourceOptions,
          resource
        });
        if (result === false) {
          console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
          break
        }
      }
    } finally {
      this._isRunningHooks = false;
    }
    return context;
  }


  _addApiMethod(method, handler) {
    if (method === null || method === undefined) {
      throw new Error('Method name is required');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    
    // Check if property already exists on the instance or prototype chain
    if (method in this) {
      throw new Error(`Cannot define API method '${method}': property already exists on API instance`);
    }
    
    this._apiMethods.set(method, handler)
    return this
  }

  _addResourceMethod(method, handler) {
    if (method === null || method === undefined) {
      throw new Error('Method name is required');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    
    // Resource methods don't need property conflict checking since they're not on the main API
    this._resourceMethods.set(method, handler)
    return this
  }

  customize({ hooks = {}, apiMethods = {}, resourceMethods = {}, vars = {}, helpers = {} } = {}) {
    // Process hooks
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      let handler, functionName, hookAddOptions
      
      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        hookAddOptions = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        hookAddOptions = rest
      } else {
        throw new Error(`Hook '${hookName}' must be a function or object`)
      }
      
      if (typeof handler !== 'function') {
        throw new Error(`Hook '${hookName}' must have a function handler`)
      }
      
      this._addHook(hookName, `api:${this.options.name}`, functionName, hookAddOptions, handler)
    }

    // Process vars
    for (const [varName, value] of Object.entries(vars)) {
      this._vars.set(varName, value);
    }

    // Process helpers
    for (const [helperName, value] of Object.entries(helpers)) {
      this._helpers.set(helperName, value);
    }

    // Process apiMethods
    for (const [methodName, handler] of Object.entries(apiMethods)) {
      this._addApiMethod(methodName, handler);
    }

    // Process resourceMethods
    for (const [methodName, handler] of Object.entries(resourceMethods)) {
      this._addResourceMethod(methodName, handler);
    }

    return this;
  }

  _addResource(name, options = {}, extras = {}) {
    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists`);
    }
    
    const { hooks = {}, apiMethods = {}, resourceMethods = {}, vars = {}, helpers = {} } = extras;
    
    // Process resource hooks - wrap them to only run for this resource
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      let handler, functionName, hookAddOptions
      
      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        hookAddOptions = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        hookAddOptions = rest
      } else {
        throw new Error(`Hook '${hookName}' must be a function or object`)
      }
      
      if (typeof handler !== 'function') {
        throw new Error(`Hook '${hookName}' must have a function handler`)
      }
      
      // Wrap handler to only run for this resource
      const resourceName = name; // Capture resource name in closure
      const wrappedHandler = (handlerParams) => {
        if (handlerParams.resource === resourceName) {
          return handler(handlerParams);
        }
      };
      
      this._addHook(hookName, `resource:${name}`, functionName, hookAddOptions, wrappedHandler)
    }
    
    // Store resource configuration with underscore prefix for internal properties
    this._resources.set(name, {
      options: Object.freeze({ ...options }),
      _apiMethods: new Map(Object.entries(apiMethods)), // Deprecated - for backward compatibility
      _resourceMethods: new Map(Object.entries(resourceMethods)),
      _vars: new Map(Object.entries(vars)),
      _helpers: new Map(Object.entries(helpers))
    });
    
    return this;
  }



  use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) throw new Error('Plugin must be an object.')
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') throw new Error('Plugin must have a non-empty "name" property.')
    if (typeof plugin.install !== 'function') throw new Error(`Plugin '${plugin.name}' must have an 'install' function.`)

    if (plugin.name === 'api' || plugin.name === 'resources') {
      throw new Error(`Plugin name '${plugin.name}' is reserved.`)
    }

    if (this._installedPlugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already installed on API '${this.options.name}'.`)
    }

    const dependencies = plugin.dependencies || []
    for (const depName of dependencies) {
      if (!this._installedPlugins.has(depName)) {
        throw new Error(`Plugin '${plugin.name}' requires dependency '${depName}' which is not installed.`)
      }
    }

    try {
      // Store plugin options separately
      this._pluginOptions[plugin.name] = Object.freeze(options)
      
      // Create flattened install context
      const installContext = {
        // Setup methods
        addApiMethod: this._addApiMethod.bind(this),
        addResourceMethod: this._addResourceMethod.bind(this),
        addResource: this._addResource.bind(this),
        runHooks: this._runHooks.bind(this),
        
        // Special addHook that injects plugin name
        addHook: (hookName, functionName, hookAddOptions, handler) => {
          if (typeof hookAddOptions === 'function' && handler === undefined) {
            handler = hookAddOptions;
            hookAddOptions = {};
          }
          return this._addHook(hookName, plugin.name, functionName, hookAddOptions, handler);
        },
        
        // Data access
        vars: this._varsProxy,
        helpers: this._helpersProxy,
        resources: this.resources,
        
        // Plugin info
        name: plugin.name,
        apiOptions: Object.freeze({ ...this._apiOptions }),
        pluginOptions: Object.freeze({ ...this._pluginOptions }),
        context: {}
      };
      
      plugin.install(installContext)
      this._installedPlugins.add(plugin.name)
    } catch (error) {
      console.error(`Error installing plugin '${plugin.name}' on API '${this.options.name}':`, error)
      throw new Error(`Failed to install plugin '${plugin.name}': ${error.message}`)
    }
    return this
  }
}

export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}