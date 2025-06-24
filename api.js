import semver from 'semver' // Use the actual semver library

// --- Global Registry (Central Store for API Instances and Resources) ---
// This is now a more complex global registry.
// It maps API names and versions to Api instances,
// and also maps ALL globally unique resource names to their owning Api instance.
let globalRegistry = {
  apiInstances: new Map(), // Map<apiName, Map<apiVersion, ApiInstance>>
  resourceToApiMap: new Map(), // Map<resourceName, ApiInstance>
}

// --- Proxy Handler for Resource Access (Layer 2 - now specific to Resources) ---
// This enables calls like Api.resources.users.createUser() or Api.resources.users.version('1.0.0').beforeOperation()
// This proxy now operates on a simple 'ResourceProxyTarget' object,
// which points back to the owning Api instance and the resource name.
const ResourceProxyHandler = {
  get(targetResourceProxy, prop) {
    const { apiInstance, resourceName } = targetResourceProxy

    // Handle version selection first for the *parent API instance*
    if (prop === 'version') {
      return (range = 'latest') => {
        // Find the specific version of the *parent API*
        const specificApi = Api.registry.get(apiInstance.options.name, range)
        if (!specificApi) {
          console.warn(`API '${apiInstance.options.name}' version '${range}' not found for resource '${resourceName}'.`)
          return null // Or throw, depending on desired strictness
        }
        // Return a new proxy target pointing to the specific API version, but for the *same resource*
        return new Proxy({ apiInstance: specificApi, resourceName: resourceName }, ResourceProxyHandler)
      }
    }

    // Handle implemented methods (delegated to the owning Api instance)
    // Methods like 'createUser' are implemented by the *Api instance*, not the resource itself.
    if (apiInstance.implementers.has(prop)) {
      return async (context = {}) => {
        // Automatically execute the implemented method on the *owning Api instance*
        // Pass resourceName in context
        return await apiInstance.execute(prop, { ...context, resourceName })
      }
    }

    // Handle hooks (allowing direct execution of hooks like Api.resources.users.beforeOperation())
    // This allows manually triggering hooks for testing or specific scenarios.
    // These hooks could be API-wide or resource-specific.
    if (apiInstance.hooks.has(prop)) { // Check API-wide hooks first
      return async (context = {}) => {
        // Automatically execute the hook chain for this name on the *owning Api instance*
        // Pass resourceName in context
        return await apiInstance.executeHook(prop, { ...context, resourceName })
      }
    }

    // Fallback to original properties of the targetResourceProxy if any, though unlikely to be used.
    return targetResourceProxy[prop]
  }
}

/**
 * Core API class providing versioning, hook, and implementation systems.
 * An Api instance is now a container for resources, not a resource itself.
 */
export class Api {
  constructor(options = {}) {
    // Core properties for THIS API instance
    this.options = {
      name: null, // Name of this API instance (e.g., 'CRM_API')
      version: null, // Version of this API instance (e.g., '1.0.0')
      ...options,
      // Hooks from constructor options will now apply to the whole API instance,
      // and will receive resourceName in context if called via a resource proxy.
      hooks: options.hooks || {} // Ensure hooks property exists for constructor
    }

    // Storage for resources managed by THIS API instance
    // Map<resourceName, { name: string, hooks: Map<hookName, Array<handlerEntry>> }>
    this.resources = new Map()

    // Hook system: Map<hookName, Array<{ handler: Function, pluginName: string, functionName: string }>>
    // This holds hooks specific to THIS Api instance (API-wide hooks).
    this.hooks = new Map()

    // Storage for different implementations (API-wide implementations).
    this.implementers = new Map()

    // To track installed plugins: Set<pluginName>
    this._installedPlugins = new Set() // Stores just the names of installed plugins

    // Process hooks defined in the constructor options (API-wide hooks)
    if (this.options.hooks && typeof this.options.hooks === 'object') {
      for (const hookName in this.options.hooks) {
        if (Object.prototype.hasOwnProperty.call(this.options.hooks, hookName)) {
          const hookDefinition = this.options.hooks[hookName]

          let originalHandler
          let functionName
          let params = {}

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

          // Register this handler with the API instance's hook map.
          // These are API-wide hooks. The 'pluginName' for these is the API's own name.
          this.hook(hookName, this.options.name, functionName, params, originalHandler)
        }
      }
    }

    // Auto-register this API instance if name and version provided
    if (this.options.name && this.options.version) {
      this.register()
    }
  }

  // --- Static Proxy for Seamless API Resource Access (Layer 1) ---
  // This enables calls like Api.resources.users.createUser()
  static resources = new Proxy({}, {
    get(target, resourceName) {
      if (typeof resourceName !== 'string') {
        return target[resourceName] // Fallback for non-string properties like 'Symbol' or built-ins
      }

      // Find the API instance that owns this resource globally
      const apiInstance = globalRegistry.resourceToApiMap.get(resourceName)
      if (!apiInstance) {
        console.warn(`API resource '${resourceName}' not found in global registry.`)
        return undefined
      }

      // Return a proxy that points to the owning Api instance and the requested resource name.
      // The ResourceProxyHandler will then handle method/hook delegation.
      return new Proxy({ apiInstance, resourceName }, ResourceProxyHandler)
    }
  })

  /**
   * Register this API instance in the global registry by its name and version.
   * Throws an error if name or version are missing, or if the version format is invalid.
   */
  register() {
    const { name, version } = this.options

    if (!name || !version) {
      throw new Error('API instance name and version required for registration.')
    }
    if (!semver.valid(version)) {
      throw new Error(`Invalid version format for API '${name}': ${version}`)
    }

    if (!globalRegistry.apiInstances.has(name)) {
      globalRegistry.apiInstances.set(name, new Map())
    }
    if (globalRegistry.apiInstances.get(name).has(version)) {
      console.warn(`API '${name}' version '${version}' is being re-registered. Overwriting existing instance.`)
    }
    globalRegistry.apiInstances.get(name).set(version, this)
    return this
  }

  /**
   * Add a resource to this API instance.
   * A resource encapsulates its name and resource-specific hooks.
   * Resource names must be unique globally across all API instances.
   * @param {string} name - The globally unique name of the resource (e.g., 'books', 'authors').
   * @param {Object} [resourceHooks={}] - A map of hook names to their handlers/definitions, specific to this resource.
   * @returns {Api} The API instance for chaining.
   * @throws {Error} If resource name is invalid or already registered globally.
   */
  addResource(name, resourceHooks = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Resource name must be a non-empty string.')
    }
    if (globalRegistry.resourceToApiMap.has(name)) {
      throw new Error(`Resource '${name}' is already registered by another API instance or this one. Resource names must be globally unique.`)
    }

    // Store a simple object for the resource internally
    const resourceInternal = {
      name: name,
      hooks: new Map() // Resource-specific hooks
    }

    // Process resource-specific hooks
    if (resourceHooks && typeof resourceHooks === 'object') {
      for (const hookName in resourceHooks) {
        if (Object.prototype.hasOwnProperty.call(resourceHooks, hookName)) {
          const hookDefinition = resourceHooks[hookName]

          let originalHandler
          let functionName
          let params = {}

          if (typeof hookDefinition === 'function') {
            originalHandler = hookDefinition
            functionName = hookName
          } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
            if (typeof hookDefinition.handler !== 'function') {
              throw new Error(`Resource hook '${hookName}' for resource '${name}' must have a 'handler' function.`)
            }
            originalHandler = hookDefinition.handler
            functionName = hookDefinition.functionName || hookName
            params = { ...hookDefinition }
            delete params.handler
            delete params.functionName
          } else {
            throw new Error(`Resource hook '${hookName}' for resource '${name}' has an invalid definition type.`)
          }

          // Create the wrapping function for resource-defined hooks.
          // This wrapper adds `resourceName` to context and ensures the hook is relevant.
          const wrappedHandler = async (context) => {
            // Only run this hook if the context explicitly specifies this resource,
            // or if the hook doesn't care about a specific resource (e.g., general 'preOperation' hook).
            // For addResource defined hooks, they implicitly apply to their resource.
            if (!context.resourceName || context.resourceName === name) {
              return await originalHandler(context)
            }
            return undefined // Don't run if not the target resource
          }
          wrappedHandler._originalHandler = originalHandler // For debugging
          wrappedHandler._wrappedForResource = name // For debugging

          // Register this wrapped handler with the resource's internal hook map
          // Use the resource name as the 'pluginName' for its own internal hooks.
          this.hook(hookName, name, functionName, params, wrappedHandler, resourceInternal.hooks)
        }
      }
    }

    this.resources.set(name, resourceInternal)
    globalRegistry.resourceToApiMap.set(name, this) // Map global resource name to this API instance
    return this
  }

  /**
   * Static accessor for registry operations related to API instances.
   */
  static registry = {
    /**
     * Get a compatible API instance.
     * @param {string} name - The name of the API (e.g., 'CRM_API').
     * @param {string} [version='latest'] - The desired version or a semver range for the API.
     * @returns {Api|null} The API instance or null if not found.
     */
    get(name, version = 'latest') {
      const versions = globalRegistry.apiInstances.get(name)
      if (!versions) return null

      // 1. OPTIMIZATION: Exact match check first for non-'latest' requests.
      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version)
      }

      // 2. Sort versions in descending order (only if needed for 'latest' or satisfaction checks).
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a))

      // 3. Handle 'latest' request (which now relies on the sort).
      if (version === 'latest') {
        return sortedVersions[0]?.[1]
      }

      // 4. Handle compatible version using semver satisfaction.
      for (const [ver, api] of sortedVersions) {
        // Your custom logic for non-operator versions (e.g., '1.2.3' means '>=1.2.3')
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
     * @param {string} name - The name of the API.
     * @param {string} [version='latest'] - The desired version or a semver range.
     * @returns {Api|null} The API instance or null if not found.
     */
    find(name, version = 'latest') {
      return this.get(name, version)
    },

    /**
     * List all registered APIs and their versions.
     * @returns {Object} An object where keys are API names and values are arrays of sorted versions.
     */
    list() {
      const registry = {}
      for (const [name, versionsMap] of globalRegistry.apiInstances) {
        registry[name] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    /**
     * Check if an API (and optionally a specific version) is registered.
     * @param {string} name - The name of the API.
     * @param {string} [version] - The specific version to check for.
     * @returns {boolean} True if the API (and version) exists, false otherwise.
     */
    has(name, version) {
      if (!name) return false
      const versions = globalRegistry.apiInstances.get(name)
      if (!versions) return false
      return version ? versions.has(version) : versions.size > 0
    },

    /**
     * Get all versions of an API by name.
     * @param {string} name - The name of the API.
     * @returns {string[]} An array of version strings.
     */
    versions(name) {
      const versions = globalRegistry.apiInstances.get(name)
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : []
    }
  }

  /**
   * Register a hook handler for a specific hook name.
   * This method now can register hooks to the API instance's general hooks,
   * or to a specific resource's hooks map if provided.
   * @param {string} hookName - The name of the hook.
   * @param {string} pluginName - The name of the plugin registering this hook.
   * @param {string} functionName - A unique name for this specific handler function within its plugin for this hook.
   * @param {Object} [params={}] - Parameters for hook placement.
   * @param {Function} handler - The asynchronous function to be executed when the hook runs.
   * @param {Map} [targetHooksMap=this.hooks] - The specific Map to register the hook to (defaults to API-wide hooks).
   * @returns {Api} The API instance for chaining.
   * @throws {Error} If pluginName/functionName are invalid, handler is not a function, or placement target is not found/conflicting.
   */
  hook(hookName, pluginName, functionName, params = {}, handler, targetHooksMap = this.hooks) {
    if (typeof pluginName !== 'string' || pluginName.trim() === '') {
      throw new Error(`Hook '${hookName}' requires a valid 'pluginName' to be specified.`)
    }
    if (typeof functionName !== 'string' || functionName.trim() === '') {
      throw new Error(`Hook '${hookName}' from plugin '${pluginName}' requires a valid 'functionName'.`)
    }
    if (typeof handler !== 'function') {
      throw new Error(`Hook handler for '${hookName}' from plugin '${pluginName}' (function: '${functionName}') must be a function.`)
    }

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

    if (!targetHooksMap.has(hookName)) {
      targetHooksMap.set(hookName, [])
    }
    const handlers = targetHooksMap.get(hookName)
    const newHandlerEntry = { handler, pluginName, functionName }

    let inserted = false

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

  /**
   * Execute all registered handlers for a given hook name.
   * This now aggregates API-wide hooks and resource-specific hooks.
   * @param {string} name - The name of the hook to execute.
   * @param {object} context - The context object to pass to the handlers.
   * @returns {Promise<object>} The modified context object after all handlers have run.
   */
  async executeHook(name, context) {
    // Add current API instance to context for all hooks
    const fullContext = { ...context, apiInstance: this }

    // 1. Get API-wide hooks
    const apiWideHandlers = this.hooks.get(name) || []

    // 2. Get resource-specific hooks (if a resource is specified in context)
    let resourceHandlers = []
    if (fullContext.resourceName) {
      const resourceData = this.resources.get(fullContext.resourceName)
      if (resourceData && resourceData.hooks) {
        resourceHandlers = resourceData.hooks.get(name) || []
      }
    }

    // Combine and execute handlers. Order: API-wide, then Resource-specific.
    // The individual hook wrappers (for constructor/addResource) handle their own filtering.
    const allHandlers = [...apiWideHandlers, ...resourceHandlers]

    for (const { handler, pluginName, functionName } of allHandlers) {
      const result = await handler(fullContext)
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    return fullContext
  }

  /**
   * Register an implementation for a specific method (API-wide).
   * @param {string} method - The name of the method to implement (e.g., 'createUser', 'query').
   * @param {Function} handler - The function that provides the implementation.
   * @returns {Api} The API instance for chaining.
   */
  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    this.implementers.set(method, handler)
    return this
  }

  /**
   * Execute an implemented method on this API instance.
   * Throws an error if no implementation is found for the given method.
   * @param {string} method - The name of the method to execute.
   * @param {object} [context={}] - The context object to pass to the implementation.
   * @returns {Promise<any>} The result of the executed implementation.
   */
  async execute(method, context = {}) {
    const handler = this.implementers.get(method)
    if (!handler) {
      throw new Error(`No implementation found for method: ${method} on API '${this.options.name}'.`)
    }
    // Pre-execution hook: beforeOperation
    await this.executeHook('beforeOperation', { ...context, method })

    const result = await handler(context)

    // Post-execution hook: afterOperation
    await this.executeHook('afterOperation', { ...context, method, result })

    return result
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
      // The plugin's install function receives the API instance and its own name.
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
  globalRegistry = {
    apiInstances: new Map(),
    resourceToApiMap: new Map(),
  }
}