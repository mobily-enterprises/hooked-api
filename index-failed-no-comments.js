import semver from 'semver'

let globalRegistry = new Map()

const ResourceProxyHandler = {
  get(target, prop) {
    const apiInstance = target._apiInstance;
    const resourceName = target._resourceName;
    const resourceConfig = apiInstance._resources.get(resourceName);

    if (resourceConfig && resourceConfig.constants && resourceConfig.constants.has(prop)) {
      return resourceConfig.constants.get(prop);
    }

    if (resourceConfig && resourceConfig.implementers && resourceConfig.implementers.has(prop)) {
      const resourceSpecificHandler = resourceConfig.implementers.get(prop);
      return async (context = {}) => {
        const config = {
          method: prop,
          resourceName: resourceName,
          apiOptions: apiInstance.options,
          resourceOptions: resourceConfig.options,
          apiConstants: apiInstance.constants,
          resourceConstants: resourceConfig.constants
        };
        
        const api = {
          resources: apiInstance.instanceResources,
          executeHook: (name, ctx) => apiInstance.executeHook(name, ctx),
          constants: apiInstance.constants,
          options: apiInstance.options
        };
        
        return await resourceSpecificHandler({ context, config, api });
      };
    }

    if (apiInstance.constants.has(prop)) {
        return apiInstance.constants.get(prop);
    }

    if (apiInstance.implementers.has(prop)) {
      return async (context = {}) => {
        return await apiInstance._executeWithResource(prop, context, resourceName);
      };
    }

    return undefined;
  }
}

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

    if (this.options.hooks && typeof this.options.hooks === 'object') {
      for (const hookName in this.options.hooks) {
        if (Object.prototype.hasOwnProperty.call(this.options.hooks, hookName)) {
          const hookDefinition = this.options.hooks[hookName]

          let originalHandler, functionName, params = {};

          if (typeof hookDefinition === 'function') {
            originalHandler = hookDefinition
            functionName = hookName
          } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
            if (typeof hookDefinition.handler !== 'function') {
              throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' must have a 'handler' function.`)
            }
            originalHandler = hookDefinition.handler
            functionName = hookDefinition.functionName || hookName
            params = { ...hookDefinition }
            delete params.handler
            delete params.functionName
          } else {
            throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' has an invalid definition type.`)
          }

          const wrappedHandler = async (context) => await originalHandler(context)

          this.hook(hookName, `api:${this.options.name}`, functionName, params, wrappedHandler)
        }
      }
    }

    if (this.options.constants && typeof this.options.constants === 'object') {
        for (const constantName in this.options.constants) {
            if (Object.prototype.hasOwnProperty.call(this.options.constants, constantName)) {
                this.addConstant(constantName, this.options.constants[constantName]);
            }
        }
    }

    if (this.options.implementers && typeof this.options.implementers === 'object') {
      for (const methodName in this.options.implementers) {
        if (Object.prototype.hasOwnProperty.call(this.options.implementers, methodName)) {
          const handler = this.options.implementers[methodName];
          this.implement(methodName, handler);
        }
      }
    }

    this.register()

    this.instanceResources = new Proxy({}, {
      get: (target, resourceName) => {
        if (typeof resourceName !== 'string') {
          return undefined;
        }
        return this._getResourceProxy(resourceName);
      }
    });
  }

  register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    if (globalRegistry.get(name).has(version)) {
      console.warn(`API '${name}' version '${version}' is being re-registered. Overwriting existing instance.`);
    }

    globalRegistry.get(name).set(version, this)
    return this
  }

  addResource(name, resourceOptions = {}, resourceExtraHooks = {}, resourceImplementers = {}, resourceConstants = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Resource name must be a non-empty string.')
    }

    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists on API '${this.options.name}'.`);
    }

    for (const [registeredApiName, versionsMap] of globalRegistry.entries()) {
        if (registeredApiName !== this.options.name) {
            for (const otherApiInstance of versionsMap.values()) {
                if (otherApiInstance._resources.has(name)) {
                    throw new Error(`Resource name '${name}' is already used by API '${registeredApiName}' version '${otherApiInstance.options.version}'. Resource names must be globally unique across different APIs.`);
                }
            }
        }
    }
    const implementersMap = new Map();
    if (resourceImplementers && typeof resourceImplementers === 'object') {
      for (const methodName in resourceImplementers) {
        if (Object.prototype.hasOwnProperty.call(resourceImplementers, methodName)) {
          const handler = resourceImplementers[methodName];
          if (typeof handler !== 'function') {
            throw new Error(`Implementer '${methodName}' for resource '${name}' on API '${this.options.name}' must be a function.`);
          }
          if (this.implementers.has(methodName)) {
            console.warn(`Resource '${name}' is defining an implementer '${methodName}' which shadows an existing API-level implementer on '${this.options.name}'.`);
          }
          implementersMap.set(methodName, handler);
        }
      }
    }

    const constantsMap = new Map();
    if (resourceConstants && typeof resourceConstants === 'object') {
        for (const constantName in resourceConstants) {
            if (Object.prototype.hasOwnProperty.call(resourceConstants, constantName)) {
                const value = resourceConstants[constantName];
                if (this.implementers.has(constantName) || this.constants.has(constantName)) {
                    console.warn(`Resource '${name}' is defining a constant '${constantName}' which shadows an existing API-level property on '${this.options.name}'.`);
                }
                if (implementersMap.has(constantName)) {
                    console.warn(`Resource '${name}' has a constant '${constantName}' which shares a name with a resource-specific implementer. The constant will take priority.`);
                }
                constantsMap.set(constantName, value);
            }
        }
    }

    this._resources.set(name, {
        options: resourceOptions,
        implementers: implementersMap,
        constants: constantsMap
    });

    for (const hookName in resourceExtraHooks) {
      if (Object.prototype.hasOwnProperty.call(resourceExtraHooks, hookName)) {
        const hookDefinition = resourceExtraHooks[hookName]
        let originalHandler, functionName, params = {};

        if (typeof hookDefinition === 'function') {
          originalHandler = hookDefinition; functionName = hookName;
        } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
          if (typeof hookDefinition.handler !== 'function') throw new Error(`Resource hook '${hookName}' for resource '${name}' must have a 'handler' function.`)
          originalHandler = hookDefinition.handler; functionName = hookDefinition.functionName || hookName;
          params = { ...hookDefinition }; delete params.handler; delete params.functionName;
        } else {
          throw new Error(`Resource hook '${hookName}' for resource '${name}' has an invalid definition type.`)
        }

        const wrappedHandler = async (context) => {
          if (context && context.resourceName === name) {
            return await originalHandler(context);
          }
          return undefined;
        };

        this.hook(hookName, `resource:${name}`, functionName, params, wrappedHandler);
      }
    }
    return this;
  }

  _getResourceProxy(resourceName) {
    if (!this._resources.has(resourceName)) {
      console.warn(`Resource '${resourceName}' not found on API '${this.options.name}'.`);
      return undefined;
    }
    return new Proxy({ _apiInstance: this, _resourceName: resourceName }, ResourceProxyHandler);
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

      for (const [ver, api] of sortedVersions) {
        if (!version.match(/[<>^~]/) && semver.valid(version)) {
            if (semver.gte(ver, version)) {
                return api;
            }
        } else if (semver.satisfies(ver, version)) {
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

static _findApiInstanceByResourceName(resourceName, versionRange = 'latest') {
    let candidates = [];
    for (const versionsMap of globalRegistry.values()) {
        for (const apiInstance of versionsMap.values()) {
            if (apiInstance._resources && apiInstance._resources.has(resourceName)) {
                candidates.push(apiInstance);
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    const filteredCandidates = candidates.filter(api => {
        if (versionRange === 'latest') return true;
        return semver.satisfies(api.options.version, versionRange);
    });

    if (filteredCandidates.length === 0) {
        return null;
    }

    filteredCandidates.sort((a, b) => semver.rcompare(a.options.version, b.options.version));

    return filteredCandidates[0];
}

  static resources = new Proxy({}, {
    get(target, prop) {
      if (prop === 'version') {
        return (range = 'latest') => {
          return new Proxy({ _versionRange: range }, {
            get(versionedTarget, resourceName) {
              if (typeof resourceName !== 'string') return undefined;
              const apiInstance = Api._findApiInstanceByResourceName(resourceName, versionedTarget._versionRange);
              if (!apiInstance) {
                console.warn(`Resource '${resourceName}' not found in any API instance matching version range '${versionedTarget._versionRange}'.`);
                return undefined;
              }
              return apiInstance._getResourceProxy(resourceName);
            }
          });
        };
      }

      const resourceName = String(prop);
      const apiInstance = Api._findApiInstanceByResourceName(resourceName, 'latest');
      if (!apiInstance) {
        console.warn(`Resource '${resourceName}' not found in any registered API instance.`);
        return undefined;
      }
      return apiInstance._getResourceProxy(resourceName);
    }
  });


  hook(hookName, pluginName, functionName, params = {}, handler) {
    if (typeof pluginName !== 'string' || pluginName.trim() === '') throw new Error(`Hook '${hookName}' requires a valid 'pluginName' to be specified.`)
    if (typeof functionName !== 'string' || functionName.trim() === '') throw new Error(`Hook '${hookName}' from plugin '${pluginName}' requires a valid 'functionName'.`)
    if (typeof handler !== 'function') throw new Error(`Hook handler for '${hookName}' from plugin '${pluginName}' (function: '${functionName}') must be a function.`)

    const hasPluginPlacement = (params.beforePlugin || params.afterPlugin);
    const hasFunctionPlacement = (params.beforeFunction || params.afterFunction);
    if (hasPluginPlacement && hasFunctionPlacement) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both plugin-level and function-level placement parameters.`);
    if (params.beforePlugin && params.afterPlugin) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforePlugin' and 'afterPlugin'.`);
    if (params.beforeFunction && params.afterFunction) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforeFunction' and 'afterFunction'.`);

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }
    const handlers = this.hooks.get(hookName)
    const newHandlerEntry = { handler, pluginName, functionName }

    let inserted = false;
    if (params.beforePlugin) {
      const targetPluginName = params.beforePlugin
      const index = handlers.findIndex(h => h.pluginName === targetPluginName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforePlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.afterPlugin) {
      const targetPluginName = params.afterPlugin
      let lastIndex = -1
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i].pluginName === targetPluginName) {
          lastIndex = i
          break
        }
      }
      if (lastIndex !== -1) {
        handlers.splice(lastIndex + 1, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterPlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.beforeFunction) {
      const targetFunctionName = params.beforeFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforeFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    } else if (params.afterFunction) {
      const targetFunctionName = params.afterFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index + 1, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    }
    
    if (!inserted) {
      handlers.push(newHandlerEntry)
    }

    return this
  }

  async executeHook(name, context) {
    const handlers = this.hooks.get(name) || []
    context.apiInstance = this;
    for (const { handler, pluginName, functionName } of handlers) {
      const result = await handler(context);
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    delete context.apiInstance;
    return context;
  }

  addConstant(name, value) {
    if (this.implementers.has(name)) {
        console.warn(`Constant '${name}' is shadowing an implementer with the same name. The constant will take priority.`);
    }
    this.constants.set(name, value);
    return this;
  }

  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    if (this.constants.has(method)) {
        console.warn(`Implementer '${method}' is being shadowed by a constant with the same name. The constant will take priority.`);
    }
    this.implementers.set(method, handler)
    return this
  }

  async _executeWithResource(method, context, resourceName) {
    const handler = this.implementers.get(method);
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`);
    }
    
    const config = {
      method: method,
      resourceName: resourceName || null,
      apiOptions: this.options,
      resourceOptions: null,
      apiConstants: this.constants,
      resourceConstants: null
    };
    
    if (resourceName) {
      const resourceConfig = this._resources.get(resourceName);
      config.resourceOptions = resourceConfig?.options || {};
      config.resourceConstants = resourceConfig?.constants || new Map();
    }
    
    const api = {
      resources: this.instanceResources,
      executeHook: (name, ctx) => this.executeHook(name, ctx),
      constants: this.constants,
      options: this.options
    };
    
    return await handler({ context, config, api });
  }

  async execute(method, context = {}) {
    return await this._executeWithResource(method, context, null);
  }

  use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) throw new Error('Plugin must be an object.')
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') throw new Error('Plugin must have a non-empty "name" property.')
    if (typeof plugin.install !== 'function') throw new Error(`Plugin '${plugin.name}' must have an 'install' function.`)

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
      
      pluginApi.hook = (hookName, functionName, params, handler) => {
        if (typeof params === 'function' && handler === undefined) {
          handler = params;
          params = {};
        }
        
        return this.hook(hookName, plugin.name, functionName, params, handler);
      };
      
      plugin.install(pluginApi, options, plugin.name)
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