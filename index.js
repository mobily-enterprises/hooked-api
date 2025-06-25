import semver from 'semver'

let globalRegistry = new Map()

export class Api {
  constructor(options = {}) {
    this.options = {
      name: null,
      version: '1.0.0',
      hooks: {},
      implementers: {},
      constants: {},
      ...options
    }

    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      throw new Error('API instance must have a non-empty "name" property.');
    }
    if (!semver.valid(this.options.version)) {
      throw new Error(`Invalid version format '${this.options.version}' for API '${this.options.name}'.`);
    }

    this.hooks = new Map()
    this.constants = new Map()
    this.implementers = new Map()
    this._installedPlugins = new Set()
    this._resources = new Map()
    this._options = {
      api: Object.freeze(this.options)
    }
    
    // Create proxy for api.run.methodName() syntax
    this.run = new Proxy((...args) => this._run(...args), {
      get: (target, prop) => {
        if (typeof prop === 'string') {
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
        if (!this._resources.has(resourceName)) return undefined;
        
        // Return another proxy for the methods
        return new Proxy((...args) => this._runResource(resourceName, ...args), {
          get: (target, methodName) => {
            if (typeof methodName !== 'string') return undefined;
            return (params) => this._runResource(resourceName, methodName, params);
          },
          apply: (target, thisArg, args) => {
            return target(...args);
          }
        });
      }
    });

    for (const [hookName, hookDef] of Object.entries(this.options.hooks || {})) {
      let handler, functionName, params
      
      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        params = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        params = rest
      } else {
        throw new Error(`Hook '${hookName}' must be a function or object`)
      }
      
      if (typeof handler !== 'function') {
        throw new Error(`Hook '${hookName}' must have a function handler`)
      }
      
      this.addHook(hookName, `api:${this.options.name}`, functionName, params, handler)
    }

    if (this.options.constants && typeof this.options.constants === 'object') {
      for (const constantName in this.options.constants) {
        if (Object.prototype.hasOwnProperty.call(this.options.constants, constantName)) {
          this.constants.set(constantName, this.options.constants[constantName]);
        }
      }
    }

    if (this.options.implementers && typeof this.options.implementers === 'object') {
      for (const methodName in this.options.implementers) {
        if (Object.prototype.hasOwnProperty.call(this.options.implementers, methodName)) {
          this.implement(methodName, this.options.implementers[methodName]);
        }
      }
    }

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

      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a));

      if (version === 'latest') {
        return sortedVersions[0]?.[1] || null;
      }

      // Handle exact version requests that don't exist
      if (!version.match(/[<>^~]/) && semver.valid(version)) {
        // For non-existent exact versions, find the closest higher version
        let closestHigher = null;
        for (const [ver, api] of sortedVersions) {
          if (semver.gt(ver, version)) {
            closestHigher = api;
          }
        }
        return closestHigher;
      }

      // Handle range queries
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

  addHook(hookName, pluginName, functionName, params = {}, handler) {
    if (!pluginName?.trim()) throw new Error(`Hook '${hookName}' requires a valid pluginName`)
    if (!functionName?.trim()) throw new Error(`Hook '${hookName}' requires a valid functionName`)
    if (typeof handler !== 'function') throw new Error(`Hook '${hookName}' handler must be a function`)

    const placements = [params.beforePlugin, params.afterPlugin, params.beforeFunction, params.afterFunction].filter(Boolean);
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
    if (params.beforePlugin) {
      index = findIndex(handlers, 'pluginName', params.beforePlugin)
    } else if (params.afterPlugin) {
      index = findLastIndex(handlers, 'pluginName', params.afterPlugin)
      if (index !== -1) index++
    } else if (params.beforeFunction) {
      index = findIndex(handlers, 'functionName', params.beforeFunction)
    } else if (params.afterFunction) {
      index = findIndex(handlers, 'functionName', params.afterFunction)
      if (index !== -1) index++
    }

    if (index === -1) {
      throw new Error(`Hook '${hookName}' placement target not found`)
    }

    handlers.splice(index, 0, entry)
    return this
  }

  _buildResourceApi(resourceName) {
    const resourceConfig = this._resources.get(resourceName);
    if (!resourceConfig) {
      return { api: this, options: this._options };
    }
    
    // Create api object with overridden constants and implementers
    const api = Object.create(this);
    
    // Override constants: resource constants take precedence
    api.constants = new Map([
      ...this.constants,
      ...resourceConfig.constants
    ]);
    
    // Override implementers: resource implementers take precedence
    api.implementers = new Map([
      ...this.implementers,
      ...resourceConfig.implementers
    ]);
    
    // Create a new run proxy that uses the merged implementers
    api.run = new Proxy((...args) => api._run(...args), {
      get: (target, prop) => {
        if (typeof prop === 'string' && prop !== 'hasOwnProperty' && !prop.match(/^\d+$/)) {
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
    
    for (const { handler, pluginName, functionName } of handlers) {
      const result = await handler({ context, api, name, options, params: {}, resource });
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    return context;
  }


  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    this.implementers.set(method, handler)
    return this
  }

  addResource(name, options = {}, extras = {}) {
    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists`);
    }
    
    const { hooks = {}, implementers = {}, constants = {} } = extras;
    
    // Process resource hooks - wrap them to only run for this resource
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      let handler, functionName, params
      
      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        params = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        params = rest
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
      
      this.addHook(hookName, `resource:${name}`, functionName, params, wrappedHandler)
    }
    
    // Store resource configuration
    this._resources.set(name, {
      options: Object.freeze(options),
      implementers: new Map(Object.entries(implementers)),
      constants: new Map(Object.entries(constants))
    });
    
    return this;
  }


  async _run(method, params = {}) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    // Normalize null params to empty object for consistency
    if (params === null) {
      params = {};
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
    
    // Normalize null params to empty object for consistency
    if (params === null) {
      params = {};
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
      
      pluginApi.addHook = (hookName, functionName, params, handler) => {
        if (typeof params === 'function' && handler === undefined) {
          handler = params;
          params = {};
        }
        
        return this.addHook(hookName, plugin.name, functionName, params, handler);
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