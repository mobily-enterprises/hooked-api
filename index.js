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

    this.hooks = new Map()
    this._varsMap = new Map()
    this.vars = new Proxy({}, {
      get: (target, prop) => this._varsMap.get(prop),
      set: (target, prop, value) => {
        this._varsMap.set(prop, value);
        return true;
      }
    })
    this._helpersMap = new Map()
    this.helpers = new Proxy({}, {
      get: (target, prop) => this._helpersMap.get(prop),
      set: (target, prop, value) => {
        this._helpersMap.set(prop, value);
        return true;
      }
    })
    this.implementers = new Map()
    this._installedPlugins = new Set()
    this._resources = new Map()
    this._options = {
      api: Object.freeze(this.options)
    }
    this._isRunningHooks = false
    
    // Create proxy for api.run.methodName() syntax
    this.run = new Proxy((...args) => this._run(...args), {
      get: (target, prop) => {
        // Prevent access to internal methods and prototype pollution
        if (prop === '_run' || prop === 'hooks' || prop === '__proto__') {
          return undefined;
        }
        // Only non-numeric string props, so that api.run[123] returns undefined
        if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
          return (params) => this._run(prop, params);
        }
        return target[prop];
      },
      apply: (target, thisArg, args) => {
        return target(...args);
      }
    });
    
    // Create proxy for api.resources.resourceName.methodName() syntax
    this.resources = new Proxy({}, {
      get: (target, resourceName) => {
        // Prevent prototype pollution and symbol-based bypasses
        if (typeof resourceName === 'symbol' || resourceName === 'constructor' || resourceName === '__proto__') {
          return undefined;
        }
        
        if (!this._resources.has(resourceName)) return undefined;
        
        // Return another proxy for the methods
        return new Proxy((...args) => this._runResource(resourceName, ...args), {
          get: (target, prop) => {
            // Only non-numeric string props, so that resources.users[123] returns undefined
            if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
              return (params) => this._runResource(resourceName, prop, params);
            }
            return target[prop];
          },
          apply: (target, thisArg, args) => {
            return target(...args);
          }
        });
      }
    });


    this.register()
  }

  register() {
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

  addHook(hookName, pluginName, functionName, hookAddOptions, handler) {
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

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }
    
    const handlers = this.hooks.get(hookName)
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

  _buildResourceApi(resourceName) {
    const resourceConfig = this._resources.get(resourceName);
    if (!resourceConfig) {
      return { api: this, options: this._options };
    }
    
    // Create api object with overridden vars and implementers
    const api = Object.create(this);
    
    // Override vars: resource vars take precedence
    const mergedVars = new Map([
      ...this._varsMap,
      ...resourceConfig.vars
    ]);
    api.vars = new Proxy({}, {
      get: (target, prop) => mergedVars.get(prop),
      set: (target, prop, value) => {
        mergedVars.set(prop, value);
        return true;
      }
    });
    
    // Override helpers: resource helpers take precedence
    const mergedHelpers = new Map([
      ...this._helpersMap,
      ...resourceConfig.helpers
    ]);
    api.helpers = new Proxy({}, {
      get: (target, prop) => mergedHelpers.get(prop),
      set: (target, prop, value) => {
        mergedHelpers.set(prop, value);
        return true;
      }
    });
    
    // Override implementers: resource implementers take precedence
    api.implementers = new Map([
      ...this.implementers,
      ...resourceConfig.implementers
    ]);
    
    // Create a new run proxy that uses the merged implementers
    api.run = new Proxy((...args) => api._run(...args), {
      get: (target, prop) => {
        // Only non-numeric string props, so that api.run[123] returns undefined
        if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
          return (params) => api._run(prop, params);
        }
        return target[prop];
      },
      apply: (target, thisArg, args) => {
        return target(...args);
      }
    });
    
    // Build options with resource info
    const options = Object.assign({}, this._options, {
      resources: Object.freeze(resourceConfig.options)
    });
    
    return { api, options };
  }

  async runHooks(name, context, resource = null) {
    const handlers = this.hooks.get(name) || []
    const { api, options } = resource ? this._buildResourceApi(resource) : { api: this, options: this._options };
    
    this._isRunningHooks = true;
    try {
      for (const { handler, pluginName, functionName } of handlers) {
        const result = await handler({ context, api, name, options, params: {}, resource });
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


  implement(method, handler) {
    if (method === null || method === undefined) {
      throw new Error('Method name is required');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    this.implementers.set(method, handler)
    return this
  }

  customize({ hooks = {}, implementers = {}, vars = {}, helpers = {} } = {}) {
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
      
      this.addHook(hookName, `api:${this.options.name}`, functionName, hookAddOptions, handler)
    }

    // Process vars
    for (const [varName, value] of Object.entries(vars)) {
      this.vars[varName] = value;
    }

    // Process helpers
    for (const [helperName, value] of Object.entries(helpers)) {
      this.helpers[helperName] = value;
    }

    // Process implementers
    for (const [methodName, handler] of Object.entries(implementers)) {
      this.implement(methodName, handler);
    }

    return this;
  }

  addResource(name, options = {}, extras = {}) {
    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists`);
    }
    
    const { hooks = {}, implementers = {}, vars = {}, helpers = {} } = extras;
    
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
      const wrappedHandler = ({ context, api, name, options, params, resource }) => {
        if (resource === resourceName) {
          return handler({ context, api, name, options, params, resource });
        }
      };
      
      this.addHook(hookName, `resource:${name}`, functionName, hookAddOptions, wrappedHandler)
    }
    
    // Store resource configuration
    this._resources.set(name, {
      options: Object.freeze({ ...options }),
      implementers: new Map(Object.entries(implementers)),
      vars: new Map(Object.entries(vars)),
      helpers: new Map(Object.entries(helpers))
    });
    
    return this;
  }


  async _run(method, params = {}) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    return await handler({ context: {}, api: this, name: method, options: this._options, params, resource: null });
  }

  async _runResource(resourceName, method, params = {}) {
    const resource = this._resources.get(resourceName);
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    
    // Find handler (resource first, then API)
    const handler = resource.implementers.get(method) || this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method} on resource: ${resourceName}`);
    }
    
    // Get the resource-aware api and options
    const { api, options } = this._buildResourceApi(resourceName);
    
    return await handler({ 
      context: {}, 
      api, 
      name: method, 
      options,
      params,
      resource: resourceName
    });
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
      const pluginApi = Object.create(this);
      
      pluginApi.addHook = (hookName, functionName, hookAddOptions, handler) => {
        if (typeof hookAddOptions === 'function' && handler === undefined) {
          handler = hookAddOptions;
          hookAddOptions = {};
        }
        
        return this.addHook(hookName, plugin.name, functionName, hookAddOptions, handler);
      };
      
      this._options[plugin.name] = Object.freeze(options)
      
      plugin.install({ context: {}, api: pluginApi, name: plugin.name, options: this._options })
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