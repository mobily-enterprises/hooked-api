// api.js

import semver from 'semver' // Use the actual semver library

// Global registry for all APIs, simplified to manage API instances by name and version
let globalRegistry = new Map() // Changed to 'let' so it can be reassigned for testing

// --- Proxy Handler for API Instance Access (Layer 2) ---
// This enables calls like Api.resources.users.createUser() or Api.resources.users.version('1.0.0').beforeOperation()
const ApiInstanceProxyHandler = {
  get(targetApiInstance, prop) {
    // Handle version selection first
    if (prop === 'version') {
      return (range = 'latest') => {
        const specificApi = Api.registry.get(targetApiInstance.options.name, range)
        if (!specificApi) {
          console.warn(`API '${targetApiInstance.options.name}' version '${range}' not found.`)
          return null
        }
        // Return a new proxy for the specific version
        return new Proxy(specificApi, ApiInstanceProxyHandler)
      }
    }

    // Handle implemented methods
    if (targetApiInstance.implementers.has(prop)) {
      return async (context = {}) => {
        // Automatically execute the implemented method
        return await targetApiInstance.execute(prop, context)
      }
    }

    // Handle hooks (allowing direct execution of hooks like Api.resources.users.beforeOperation())
    // This allows manually triggering hooks for testing or specific scenarios
    if (targetApiInstance.hooks.has(prop)) {
      return async (context = {}) => {
        // Automatically execute the hook chain for this name
        return await targetApiInstance.executeHook(prop, context)
      }
    }

    // Fallback to original properties of the Api instance (e.g., options, hooks map, implementers map)
    return targetApiInstance[prop]
  }
}

/**
 * Core API class providing versioning, hook, and implementation systems.
 */
export class Api {
  constructor(options = {}) {
    // Core properties
    this.options = {
      name: null,
      version: null,
      hooks: {}, // Initialize hooks property for constructor
      ...options
    }

    // Hook system: Map<hookName, Array<{ handler: Function, pluginName: string, functionName: string }>>
    // This now exclusively holds hooks specific to THIS Api instance
    this.hooks = new Map()

    // Storage for different implementations
    this.implementers = new Map()

    // To track installed plugins: Set<pluginName>
    this._installedPlugins = new Set() // Stores just the names of installed plugins

    // Process hooks defined in the constructor options
    if (this.options.hooks && typeof this.options.hooks === 'object') {
      for (const hookName in this.options.hooks) {
        if (Object.prototype.hasOwnProperty.call(this.options.hooks, hookName)) {
          const hookDefinition = this.options.hooks[hookName]

          let originalHandler
          let functionName
          let params = {}

          // Determine syntax: function or object
          if (typeof hookDefinition === 'function') {
            originalHandler = hookDefinition
            functionName = hookName // Use the hook key as functionName
          } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
            // Detailed syntax: { functionName, params, handler }
            if (typeof hookDefinition.handler !== 'function') {
              throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' must have a 'handler' function.`)
            }
            originalHandler = hookDefinition.handler
            functionName = hookDefinition.functionName || hookName // Use explicit functionName or hookKey
            params = { ...hookDefinition } // Copy all properties as params
            delete params.handler // Remove handler from params
            delete params.functionName // Remove functionName from params
          } else {
            throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' has an invalid definition type.`)
          }

          // Create the wrapping function for constructor-defined hooks
          // This wrapper enforces the "ONLY run for this instance" rule
          const registeredResourceName = this.options.name // Capture the API's name (e.g., 'projects')
          const wrappedHandler = async (context) => {
            // Check if this hook should run for the current ApiInstance executing it
            // 'core' hooks are always meant to run, regardless of instance name.
            if (context.apiInstance && (context.apiInstance.options.name === registeredResourceName || registeredResourceName === 'core')) {
              return await originalHandler(context)
            }
            // If the instance name doesn't match, or it's not a 'core' hook, do nothing.
            return undefined // Return undefined to not interfere with chain if not running
          }
          // Attach original metadata for debugging if needed, but not used by executeHook
          wrappedHandler._originalHandler = originalHandler
          wrappedHandler._wrappedForResource = registeredResourceName

          // Register this wrapped handler with the instance's hook map
          // The pluginName for these is the API's own name (its resource name)
          // The params here are used by hook() for ordering.
          this.hook(hookName, this.options.name, functionName, params, wrappedHandler)
        }
      }
    }

    // Auto-register if name and version provided
    if (this.options.name && this.options.version) {
      this.register()
    }
  }

  /**
   * Register this API in the global registry by its name and version.
   * Throws an error if name or version are missing, or if the version format is invalid.
   */
  register() {
    const { name, version } = this.options

    if (!name || !version) {
      throw new Error('API name and version required for registration')
    }

    if (!semver.valid(version)) { // Use actual semver
      throw new Error(`Invalid version format: ${version}`)
    }

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    globalRegistry.get(name).set(version, this)
    return this
  }

  /**
   * Get all registered versions of an API by its name.
   * This is now a shortcut/alias to `Api.registry.versions()`.
   * @param {string} name - The name of the API.
   * @returns {string[]} An array of version strings.
   */
  static versions(name) {
    return Api.registry.versions(name)
  }

  /**
   * Get a compatible API version based on a name and a version range.
   * This is now a shortcut/alias to `Api.registry.get()`.
   * @param {string} name - The name of the API.
   * @param {string} [version='latest'] - The desired version or a semver range.
   * @returns {Api|null} The API instance or null if not found.
   */
  static get(name, version = 'latest') {
    return Api.registry.get(name, version)
  }

  /**
   * Static accessor for registry operations.
   * ALL implementation logic for fetching and listing API versions is now here.
   */
  static registry = {
    /**
     * Get a compatible API version.
     * This method now contains the full logic for version lookup.
     * @param {string} name - The name of the API.
     * @param {string} [version='latest'] - The desired version or a semver range.
     * @returns {Api|null} The API instance or null if not found.
     */
    get(name, version = 'latest') {
      const versions = globalRegistry.get(name)
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
        .sort(([a], [b]) => semver.compare(b, a)) // Use actual semver

      // 3. Handle 'latest' request (which now relies on the sort).
      if (version === 'latest') {
        return sortedVersions[0]?.[1] // Get the API from the highest version
      }

      // 4. Handle compatible version using semver satisfaction (if it wasn't an exact match or 'latest').
      for (const [ver, api] of sortedVersions) {
        // If no operators, treat as minimum version (e.g., '1.2.3' could mean '>=1.2.3' if not an exact match).
        // This is a specific logic for your API that doesn't fully map to semver.satisfies for all cases.
        // For actual semver, `semver.satisfies(ver, version)` would be the primary check.
        if (!version.match(/[<>^~]/) && semver.valid(version)) { // Added semver.valid check
          if (semver.gte(ver, version)) { // Use actual semver
            return api
          }
        } else if (semver.satisfies(ver, version)) { // Use actual semver
          return api
        }
      }

      // 5. If nothing matched.
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
      for (const [name, versionsMap] of globalRegistry) {
        registry[name] = Array.from(versionsMap.keys()).sort(semver.rcompare) // Use actual semver
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
      const versions = globalRegistry.get(name)
      if (!versions) return false
      return version ? versions.has(version) : versions.size > 0
    },

    /**
     * Get all versions of an API by name.
     * @param {string} name - The name of the API.
     * @returns {string[]} An array of version strings.
     */
    versions(name) {
      const versions = globalRegistry.get(name)
      // Fix: Add sorting here as well
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : []
    }
  }

  // --- Static Proxy for Seamless API Resource Access (Layer 1) ---
  // This enables calls like Api.resources.users.createUser()
  static resources = new Proxy({}, {
    get(target, resourceName) {
      if (typeof resourceName !== 'string') {
        return target[resourceName] // Fallback for non-string properties like 'Symbol' or built-ins
      }

      const apiInstance = Api.registry.get(resourceName, 'latest') // Get the latest version by default
      if (!apiInstance) {
        console.warn(`API resource '${resourceName}' not found in registry.`)
        return undefined // Return undefined if the API is not registered
      }

      // Return a proxy for the specific API instance
      return new Proxy(apiInstance, ApiInstanceProxyHandler)
    }
  })

  /**
   * Register a hook handler for a specific hook name.
   * Handlers are placed based on 'beforePlugin'/'afterPlugin' or 'beforeFunction'/'afterFunction' parameters,
   * or simply pushed in insertion order.
   * @param {string} hookName - The name of the hook.
   * @param {string} pluginName - The name of the plugin registering this hook. Must be explicitly provided.
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
   * Note: Handlers provided here are NOT wrapped by `Api` itself for conditional execution.
   * If conditional execution (e.g., only for a specific resource name) is desired,
   * the handler function itself must implement that logic (as seen with constructor hooks).
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
    const newHandlerEntry = { handler, pluginName, functionName } // Now includes functionName

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
   * @param {object} context - The context object to pass to the handlers.
   * @returns {Promise<object>} The modified context object after all handlers have run.
   */
  async executeHook(name, context) {
    const handlers = this.hooks.get(name) || []
    for (const { handler, pluginName, functionName } of handlers) {
      // FIX: Pass the current API instance as part of the context for wrapped handlers to use
      const result = await handler({ ...context, apiInstance: this }) // Pass apiInstance to context
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    return context
  }

  /**
   * Register an implementation for a specific method.
   * @param {string} method - The name of the method to implement (e.g., 'get', 'query').
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
   * Execute an implemented method.
   * Throws an error if no implementation is found for the given method.
   * @param {string} method - The name of the method to execute.
   * @param {object} [context={}] - The context object to pass to the implementation.
   * @returns {Promise<any>} The result of the executed implementation.
   */
  async execute(method, context = {}) { // Made async
    const handler = this.implementers.get(method)
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`)
    }
    return await handler(context) // Await handler for async support
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
   *
   * Note: The plugin's 'install' function will now receive its own name as a third argument,
   * which it should then pass to any 'apiInstance.hook()' calls it makes, along with the
   * unique functionName and placement parameters.
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