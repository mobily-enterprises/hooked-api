import semver from 'semver' // Use the actual semver library

// Global registry for all API instances
// Now stores Map<API_Name, Map<API_Version, Api_Instance>>
let globalRegistry = new Map()

/**
 * A proxy handler that intercepts property access on a specific resource.
 *
 * This is the core mechanism that allows for seamless access to both resource-specific
 * and API-level constants and implementers (methods). When a property is accessed on a
 * resource proxy (e.g., `myApi.users.create` or `myApi.users.placeholder`), this handler's
 * `get` method resolves the property based on a defined order of precedence.
 *
 * The lookup priority is as follows:
 * 1. Resource-specific constant
 * 2. Resource-specific implementer
 * 3. API-level constant
 * 4. API-level implementer
 *
 * If an implementer (function) is found, this handler returns a new async function
 * that, when called, automatically injects the correct `context` and executes the
 * original handler. If a constant is found, its value is returned directly.
 *
 * The `get` method of this handler receives the following parameters from the Proxy:
 * @param {object} target - The proxy's internal target object, containing `_apiInstance` and `_resourceName`.
 * @param {string} prop - The name of the property being accessed (e.g., 'createUser').
 * @returns {*|Function|undefined} Returns the constant's value directly, an executable async function for an implementer, or `undefined` if the property is not found.
 */
const ResourceProxyHandler = {
  get(target, prop) {
    const apiInstance = target._apiInstance;
    const resourceName = target._resourceName;
    const resourceConfig = apiInstance._resources.get(resourceName);

    // Priority 1: Check for a resource-specific constant.
    if (resourceConfig && resourceConfig.constants && resourceConfig.constants.has(prop)) {
      return resourceConfig.constants.get(prop);
    }

    // Priority 2: Check for a resource-specific implementer.
    if (resourceConfig && resourceConfig.implementers && resourceConfig.implementers.has(prop)) {
      const resourceSpecificHandler = resourceConfig.implementers.get(prop);
      // Directly execute this handler, it is not on the main API instance.
      return async (context = {}) => {
        context.resourceName = resourceName;
        context.apiInstance = apiInstance; // Add apiInstance to context for consistency.
        const result = await resourceSpecificHandler(context);
        delete context.apiInstance; // Clean up.
        delete context.resourceName;
        return result;
      };
    }
    
    // Priority 3: Check for an API-level constant.
    if (apiInstance.constants.has(prop)) {
        return apiInstance.constants.get(prop);
    }

    // Priority 4: Fallback to the general, API-level implementer.
    if (apiInstance.implementers.has(prop)) {
      return async (context = {}) => { // context here is the object passed by the caller (e.g., { data: { name: 'Jane' } })
        context.resourceName = resourceName; // Add resourceName to the context object
        const result = await apiInstance.execute(prop, context); // Pass the original context to execute
        delete context.resourceName; // Clean up the resourceName property from the context
        return result;
      };
    }

    // Priority 5: If the property is not found, it's undefined.
    return undefined;
  }
}

/**
 * Core API class providing versioning, hook, and implementation systems.
 * An instance of this class represents a complete API with its own set of resources,
 * hooks, and implementations, defined by its name and version.
 */
export class Api {
  constructor(options = {}) {
    // Core properties for this API instance
    this.options = {
      name: null,    // Unique name for this API instance (e.g., 'CRM_API')
      version: '1.0.0', // Version of this API instance
      hooks: {},     // Hooks defined during API construction
      implementers: {}, // Implementers defined during API construction
      constants: {}, // [NEW] Constants defined during API construction
      ...options
    }

    // Validate API name and version on creation
    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      throw new Error('API instance must have a non-empty "name" property.');
    }
    if (!semver.valid(this.options.version)) {
      throw new Error(`Invalid version format '${this.options.version}' for API '${this.options.name}'.`);
    }

    // Hook system: Map<hookName, Array<{ handler: Function, pluginName: string, functionName: string }>>
    // This map holds ALL hooks for THIS API instance, including general API-level hooks
    // and wrapped resource-specific hooks.
    this.hooks = new Map()

    // Storage for API-level constants
    this.constants = new Map()

    // Storage for different implementations (methods available on this API instance)
    this.implementers = new Map()

    // To track installed plugins: Set<pluginName>
    this._installedPlugins = new Set()

    // Internal map to store resource configurations (options and potentially their own hooks)
    // Map<resourceName, { options: object, implementers: Map<methodName, handler>, constants: Map<string, any> }>
    this._resources = new Map()

    // Process hooks defined in the constructor options (these are API-level hooks)
    if (this.options.hooks && typeof this.options.hooks === 'object') {
      for (const hookName in this.options.hooks) {
        if (Object.prototype.hasOwnProperty.call(this.options.hooks, hookName)) {
          const hookDefinition = this.options.hooks[hookName]

          let originalHandler
          let functionName
          let params = {}

          if (typeof hookDefinition === 'function') {
            originalHandler = hookDefinition
            functionName = hookName // Use the hook key as functionName
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

          // Constructor hooks are API-wide. They run for any operation on THIS API instance.
          // They don't need a resourceName check as they are general API hooks.
          const wrappedHandler = async (context) => {
            return await originalHandler(context)
          }

          // Register this wrapped handler with the instance's hook map
          // Use a special pluginName like `api:${this.options.name}` for clarity.
          this.hook(hookName, `api:${this.options.name}`, functionName, params, wrappedHandler)
        }
      }
    }

    // Process constants defined in the constructor options
    if (this.options.constants && typeof this.options.constants === 'object') {
        for (const constantName in this.options.constants) {
            if (Object.prototype.hasOwnProperty.call(this.options.constants, constantName)) {
                this.addConstant(constantName, this.options.constants[constantName]);
            }
        }
    }

    // Process implementers defined in the constructor options
    if (this.options.implementers && typeof this.options.implementers === 'object') {
      for (const methodName in this.options.implementers) {
        if (Object.prototype.hasOwnProperty.call(this.options.implementers, methodName)) {
          const handler = this.options.implementers[methodName];
          // We can directly call the existing implement method for consistency and validation.
          this.implement(methodName, handler);
        }
      }
    }


    // Auto-register this API instance in the global registry
    this.register()

    // Create a local proxy for accessing resources attached to THIS API instance (e.g., api1.books)
    // This allows seamless access to resources defined on this specific API instance.
    this.localResources = new Proxy({}, {
      get: (target, resourceName) => {
        if (typeof resourceName !== 'string') {
          return undefined; // Fallback for non-string properties
        }
        return this._getResourceProxy(resourceName);
      }
    });
  }

  /**
   * Register this API instance in the global registry by its name and version.
   * Throws an error if name or version are missing, or if the version format is invalid.
   */
  register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    // Check for duplicate version registration for the same API name
    if (globalRegistry.get(name).has(version)) {
      console.warn(`API '${name}' version '${version}' is being re-registered. Overwriting existing instance.`);
    }

    globalRegistry.get(name).set(version, this)
    return this
  }

  /**
   * Adds a resource configuration to this API instance.
   * A resource is a named collection of options and resource-specific hooks.
   * Resource names are globally unique across all API instances.
   * @param {string} name - The unique name of the resource (e.g., 'books', 'users').
   * @param {Object} [resourceOptions={}] - Options specific to this resource (e.g., schema, validation rules).
   * @param {Object} [resourceExtraHooks={}] - Hooks specific to this resource, defined as an object.
   * @param {Object} [resourceImplementers={}] - Implementers (methods) specific to this resource.
   * @param {Object} [resourceConstants={}] - [NEW] Constants specific to this resource.
   * @returns {Api} The API instance for chaining.
   * @throws {Error} If the resource name is invalid or already exists on this API instance (either locally or globally across other API instances).
   */
  addResource(name, resourceOptions = {}, resourceExtraHooks = {}, resourceImplementers = {}, resourceConstants = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Resource name must be a non-empty string.')
    }

    // 1. Check for local uniqueness (on this API instance)
    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists on API '${this.options.name}'.`);
    }

    // 2. Check for global uniqueness (across all registered API instances)
    // We iterate through all registered API instances to ensure no other instance has this resource name.
    for (const [apiName, versionsMap] of globalRegistry.entries()) {
      for (const [version, apiInstance] of versionsMap.entries()) {
        // Skip checking against itself, as local uniqueness is handled above.
        // This is primarily for preventing conflicts with other API instances.
        if (apiInstance !== this && apiInstance._resources.has(name)) {
          throw new Error(`Resource name '${name}' is already used by API '${apiName}' version '${version}'. Resource names must be globally unique.`);
        }
      }
    }

    // Process and store resource-specific implementers
    const implementersMap = new Map();
    if (resourceImplementers && typeof resourceImplementers === 'object') {
      for (const methodName in resourceImplementers) {
        if (Object.prototype.hasOwnProperty.call(resourceImplementers, methodName)) {
          const handler = resourceImplementers[methodName];
          if (typeof handler !== 'function') {
            throw new Error(`Implementer '${methodName}' for resource '${name}' on API '${this.options.name}' must be a function.`);
          }
          // Warn if a resource implementer "shadows" a global API implementer
          if (this.implementers.has(methodName)) {
            console.warn(`Resource '${name}' is defining an implementer '${methodName}' which shadows an existing API-level implementer on '${this.options.name}'.`);
          }
          implementersMap.set(methodName, handler);
        }
      }
    }

    // Process and store resource-specific constants
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

    // Store resource options and its specific implementers.
    this._resources.set(name, {
        options: resourceOptions,
        implementers: implementersMap,
        constants: constantsMap
    });
    // [END of enhancement]

    // Process resource-specific hooks and add them to this API instance's hook map
    for (const hookName in resourceExtraHooks) {
      if (Object.prototype.hasOwnProperty.call(resourceExtraHooks, hookName)) {
        const hookDefinition = resourceExtraHooks[hookName]

        let originalHandler
        let functionName
        let params = {}

        if (typeof hookDefinition === 'function') {
          originalHandler = hookDefinition
          functionName = hookName
        } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
          if (typeof hookDefinition.handler !== 'function') {
            throw new Error(`Resource hook '${hookName}' for resource '${name}' on API '${this.options.name}' must have a 'handler' function.`)
          }
          originalHandler = hookDefinition.handler
          functionName = hookDefinition.functionName || hookName
          params = { ...hookDefinition }
          delete params.handler
            delete params.functionName
        } else {
          throw new Error(`Resource hook '${hookName}' for resource '${name}' on API '${this.options.name}' has an invalid definition type.`)
        }

        // Wrap resource hooks to ensure they run ONLY for this specific resource (by checking context.resourceName)
        const wrappedHandler = async (context) => {
          if (context && context.resourceName === name) {
            return await originalHandler(context);
          }
          // If resourceName does not match, or is not provided, this specific resource hook does not run.
          return undefined;
        };

        // Register this wrapped handler with the API instance's hook map.
        // Use a distinct pluginName format like 'resource:<resourceName>' to identify resource-bound hooks.
        this.hook(hookName, `resource:${name}`, functionName, params, wrappedHandler);
      }
    }
    return this;
  }

  /**
   * Helper method to get the proxy for a specific resource on this API instance.
   * This is used internally by both global `Api.resources` and local `this.localResources`.
   * @param {string} resourceName - The name of the resource to get a proxy for.
   * @returns {Proxy|undefined} A proxy object for the resource, or undefined if not found.
   */
  _getResourceProxy(resourceName) {
    if (!this._resources.has(resourceName)) {
      console.warn(`Resource '${resourceName}' not found on API '${this.options.name}'.`);
      return undefined;
    }
    // Return a proxy that will delegate method/hook calls to this API instance
    // but in the context of the specific resource.
    return new Proxy({ _apiInstance: this, _resourceName: resourceName }, ResourceProxyHandler);
  }

  /**
   * Static accessor for registry operations.
   * ALL implementation logic for fetching and listing API versions is now here.
   */
  static registry = {
    /**
     * Get a compatible API instance.
     * @param {string} apiName - The name of the API instance.
     * @param {string} [version='latest'] - The desired version or a semver range for the API instance.
     * @returns {Api|null} The API instance or null if not found.
     */
    get(apiName, version = 'latest') {
      const versions = globalRegistry.get(apiName)
      if (!versions) return null

      // 1. OPTIMIZATION: Exact match check first for non-'latest' requests.
      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version)
      }

      // If we reach here, it means:
      // a) We are looking for 'latest'
      // b) We are looking for a specific version, but it wasn't an exact match (e.g., a range like '^1.0.0', or it just doesn't exist)

      // 2. Sort versions in descending order (only if needed for 'latest' or satisfaction checks).
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a))

      // 3. Handle 'latest' request (which now relies on the sort).
      if (version === 'latest') {
        return sortedVersions[0]?.[1] // Get the API from the highest version
      }

      // 4. Handle compatible version using semver satisfaction (if it wasn't an exact match or 'latest').
      for (const [ver, api] of sortedVersions) {
        // If no operators, treat as minimum version (e.g., '1.2.3' could mean '>=1.2.3' if not an exact match).
        // This is a specific logic for your API that doesn't fully map to semver.satisfies for all cases.
        // For actual semver, `semver.satisfies(ver, version)` would be the primary check.
        if (!version.match(/[<>^~]/) && semver.valid(version)) {
          if (semver.gte(ver, version)) {
            return api
          }
        } else if (semver.satisfies(ver, version)) {
          return api
        }
      }

      return null
    },

    /**
     * Alias for get().
     * @param {string} apiName - The name of the API.
     * @param {string} [version='latest'] - The desired version or a semver range.
     * @returns {Api|null} The API instance or null if not found.
     */
    find(apiName, version = 'latest') {
      return this.get(apiName, version)
    },

    /**
     * List all registered APIs and their versions.
     * @returns {Object} An object where keys are API names and values are arrays of sorted versions.
     */
    list() {
      const registry = {}
      for (const [apiName, versionsMap] of globalRegistry) {
        registry[apiName] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    /**
     * Check if an API (and optionally a specific version) is registered.
     * @param {string} apiName - The name of the API.
     * @param {string} [version] - The specific version to check for.
     * @returns {boolean} True if the API (and version) exists, false otherwise.
     */
    has(apiName, version) {
      if (!apiName) return false
      const versions = globalRegistry.get(apiName)
      if (!versions) return false
      return version ? versions.has(version) : versions.size > 0
    },

    /**
     * Get all versions of an API by name.
     * @param {string} apiName - The name of the API.
     * @returns {string[]} An array of version strings.
     */
    versions(apiName) {
      const versions = globalRegistry.get(apiName)
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : []
    }
  }

  /**
   * Helper to find an Api instance that contains the given resource name and matches an optional version range.
   * This is crucial for the global `Api.resources` proxy.
   * @param {string} resourceName - The name of the resource to find.
   * @param {string} [versionRange='latest'] - The semver range for the API instance's version.
   * @returns {Api|null} The matching API instance or null if not found.
   */
  static _findApiInstanceByResourceName(resourceName, versionRange = 'latest') {
    // Iterate through all registered API instances
    for (const [apiName, versionsMap] of globalRegistry.entries()) {
      const sortedVersions = Array.from(versionsMap.entries())
        .sort(([a], [b]) => semver.rcompare(b, a));

      for (const [ver, apiInstance] of sortedVersions) {
        // Filter by version range if specified
        if (versionRange !== 'latest') {
          if (!semver.satisfies(ver, versionRange)) {
            continue; // Skip if version doesn't match range
          }
        }

        // Check if this Api instance has the resource
        if (apiInstance._resources && apiInstance._resources.has(resourceName)) {
          // If 'latest' was requested, we return the highest version found that has the resource.
          // Due to the sort, the first one found will be the highest compatible.
          return apiInstance;
        }
      }
    }
    return null; // Resource not found in any matching API instance
  }

  /**
   * Static global entry point for accessing resources.
   * This proxy allows calls like `Api.resources.books.method()` or `Api.resources.version('>1.0.0').sales.method()`.
   */
  static resources = new Proxy({}, {
    get(target, prop) {
      // Case 1: Api.resources.version('range') -> returns a function to specify the range
      if (prop === 'version') {
        return (range = 'latest') => {
          // This returns a new proxy that, when a resourceName is accessed,
          // will look it up within API instances matching the specified range.
          return new Proxy({ _versionRange: range }, {
            get(versionedTarget, resourceName) {
              if (typeof resourceName !== 'string') {
                return undefined; // Handle non-string properties
              }
              const apiInstance = Api._findApiInstanceByResourceName(resourceName, versionedTarget._versionRange);
              if (!apiInstance) {
                console.warn(`Resource '${resourceName}' not found in any API instance matching version range '${versionedTarget._versionRange}'.`);
                return undefined;
              }
              // Delegate to the API instance's resource proxy helper
              return apiInstance._getResourceProxy(resourceName);
            }
          });
        };
      }

      // Case 2: Direct resource name access (e.g., Api.resources.someResource.method())
      // Defaults to finding the resource on the latest compatible API instance.
      const resourceName = String(prop);
      const apiInstance = Api._findApiInstanceByResourceName(resourceName, 'latest'); // Default to latest version
      if (!apiInstance) {
        console.warn(`Resource '${resourceName}' not found in any API instance.`);
        return undefined;
      }
      // Delegate to the API instance's resource proxy helper
      return apiInstance._getResourceProxy(resourceName);
    }
  });


  /**
   * Register a hook handler for a specific hook name.
   * Handlers are placed based on 'beforePlugin'/'afterPlugin' or 'beforeFunction'/'afterFunction' parameters,
   * or simply pushed in insertion order.
   * @param {string} hookName - The name of the hook.
   * @param {string} pluginName - The name of the plugin (or resource) registering this hook. Must be explicitly provided.
   * @param {string} functionName - A unique name for this specific handler function within its plugin for this hook.
   * @param {Object} [params={}] - Parameters for hook placement.
   * @param {string} [params.beforePlugin] - The name of another plugin whose first hook this should run before.
   * @param {string} [params.afterPlugin] - The name of another plugin whose last hook this should run after.
   * @param {string} [params.beforeFunction] - The `functionName` of another handler (for this `hookName`) this should run before.
   * @param {string} [params.afterFunction] - The `functionName` of another handler (for this `hookName`) this should run after.
   * @param {Function} handler - The asynchronous function to be executed when the hook runs.
   * @returns {Api} The API instance for chaining.
   * @throws {Error} If pluginName/functionName are invalid, handler is not a function, or placement target is not found/conflicting.
   *
   * Note: The `handler` provided here should already be wrapped if it's a resource-specific hook.
   */
  hook(hookName, pluginName, functionName, params = {}, handler) {
    if (typeof pluginName !== 'string' || pluginName.trim() === '') {
      throw new Error(`Hook '${hookName}' requires a valid 'pluginName' to be specified.`)
    }
    if (typeof functionName !== 'string' || functionName.trim() === '') {
      throw new Error(`Hook '${hookName}' from plugin '${pluginName}' requires a valid 'functionName'.`)
    }
    if (typeof handler !== 'function') {
      throw new Error(`Hook handler for '${hookName}' from plugin '${pluginName}' (function: '${functionName}') must be a function.`)
    }

    // Validate conflicting parameters
    const hasPluginPlacement = (params.beforePlugin || params.afterPlugin)
    const hasFunctionPlacement = (params.beforeFunction || params.afterFunction)

    if (hasPluginPlacement && hasFunctionPlacement) {
      throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both plugin-level and function-level placement parameters.`)
    }
    if (params.beforePlugin && params.afterPlugin) {
      throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforePlugin' and 'afterPlugin'.`)
    }
    if (params.beforeFunction && params.afterFunction) {
      throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforeFunction' and 'afterFunction'.`)
    }

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }
    const handlers = this.hooks.get(hookName)
    const newHandlerEntry = { handler, pluginName, functionName }

    let inserted = false

    if (params.beforePlugin) {
      const targetPluginName = params.beforePlugin
      const index = handlers.findIndex(h => h.pluginName === targetPluginName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry) // Insert BEFORE the first handler of target plugin
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforePlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.afterPlugin) {
      const targetPluginName = params.afterPlugin
      // Find the LAST handler belonging to the target plugin
      let lastIndex = -1
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i].pluginName === targetPluginName) {
          lastIndex = i
          break
        }
      }
      if (lastIndex !== -1) {
        handlers.splice(lastIndex + 1, 0, newHandlerEntry) // Insert AFTER the last handler of target plugin
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterPlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.beforeFunction) {
      const targetFunctionName = params.beforeFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry) // Insert BEFORE the target function
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforeFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    } else if (params.afterFunction) {
      const targetFunctionName = params.afterFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index + 1, 0, newHandlerEntry) // Insert AFTER the target function
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    }

    if (!inserted) {
      handlers.push(newHandlerEntry) // Default to pushing if no placement specified or target not found (after error)
    }

    return this
  }

  /**
   * Execute all registered handlers for a given hook name.
   * Handlers receive a context object and can modify it.
   * A handler returning `false` will stop the chain.
   * @param {string} name - The name of the hook to execute.
   * @param {object} context - The context object to pass to the handlers. This may include `resourceName`.
   * @returns {Promise<object>} The modified context object after all handlers have run.
   */
  async executeHook(name, context) {
    const handlers = this.hooks.get(name) || []
    context.apiInstance = this; // Temporarily add apiInstance to the original context
    for (const { handler, pluginName, functionName } of handlers) {
      const result = await handler(context); // Pass the original context by reference
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    delete context.apiInstance; // Clean up after execution
    return context; // The original context, now potentially modified
  }

  /**
   * [NEW] Register a constant on this API instance.
   * @param {string} name - The name of the constant.
   * @param {*} value - The value of the constant.
   * @returns {Api} The API instance for chaining.
   */
  addConstant(name, value) {
    if (this.implementers.has(name)) {
        console.warn(`Constant '${name}' is shadowing an implementer with the same name. The constant will take priority.`);
    }
    this.constants.set(name, value);
    return this;
  }

  /**
   * Register an implementation for a specific method.
   * These methods are executed on the API instance, potentially in the context of a resource.
   * @param {string} method - The name of the method to implement (e.g., 'get', 'query').
   * @param {Function} handler - The function that provides the implementation.
   * @returns {Api} The API instance for chaining.
   */
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

  /**
   * Execute an implemented method.
   * Throws an error if no implementation is found for the given method.
   * @param {string} method - The name of the method to execute.
   * @param {object} [context={}] - The context object to pass to the implementation. This may include `resourceName`.
   * @returns {Promise<any>} The result of the executed implementation.
   */
  async execute(method, context = {}) {
    const handler = this.implementers.get(method)
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`)
    }
    context.apiInstance = this; // Temporarily add apiInstance to the original context
    const result = await handler(context); // Pass the original context by reference
    delete context.apiInstance; // Clean up after execution
    return result; // The handler's return value
  }

  /**
   * Applies a plugin object to this API instance.
   * Plugins must be objects with a unique 'name' string and an 'install' function.
   * They can optionally define 'dependencies' (an array of plugin names).
   * @param {Object} plugin - The plugin object to install.
   * @param {string} plugin.name - A unique name for the plugin.
   * @param {string[]} [plugin.dependencies=[]] - An array of plugin names that must be installed first.
   * @param {Function} plugin.install - The function to call to install the plugin.
   * @param {Object} [options={}] - Options to pass to the plugin's install function.
   * @returns {Api} The API instance for chaining.
   * @throws {Error} If the plugin is invalid, already installed, or its dependencies are met.
   */
  use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) {
      throw new Error('Plugin must be an object.')
    }
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      throw new Error('Plugin must have a non-empty "name" property.')
    }
    if (typeof plugin.install !== 'function') {
      throw new Error(`Plugin '${plugin.name}' must have an 'install' function.`)
    }

    if (this._installedPlugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already installed on API '${this.options.name}'.`)
    }

    // Check dependencies
    const dependencies = plugin.dependencies || []
    for (const depName of dependencies) {
      if (!this._installedPlugins.has(depName)) {
        throw new Error(`Plugin '${plugin.name}' requires dependency '${depName}' which is not installed.`)
      }
    }

    try {
      // The plugin's install function now receives its own name explicitly.
      // It is the plugin's responsibility to pass this name to apiInstance.hook().
      plugin.install(this, options, plugin.name)
      this._installedPlugins.add(plugin.name)

    } catch (error) {
      console.error(`Error installing plugin '${plugin.name}' on API '${this.options.name}':`, error)
      throw new Error(`Failed to install plugin '${plugin.name}': ${error.message}`)
    }
    return this
  }
}

// Export the reset function for testing purposes
export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}