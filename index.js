import semver from 'semver'

let globalRegistry = new Map()
const VALID_JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
const DANGEROUS_PROPS = ['__proto__', 'constructor', 'prototype']
const isDangerousProp = (prop) => DANGEROUS_PROPS.includes(prop)

// Logging levels
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
}

const LOG_LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG',
  4: 'TRACE'
}

const LOG_LEVEL_VALUES = {
  'error': 0,
  'warn': 1,
  'info': 2,
  'debug': 3,
  'trace': 4
}

// ANSI color codes for pretty logging
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

const LOG_COLORS = {
  ERROR: COLORS.red,
  WARN: COLORS.yellow,
  INFO: COLORS.blue,
  DEBUG: COLORS.magenta,
  TRACE: COLORS.gray
}

// Custom error classes for better error categorization
export class HookedApiError extends Error {
  constructor(message, code = 'HOOKED_API_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends HookedApiError {
  constructor(message, { received, expected, example } = {}) {
    super(message, 'CONFIGURATION_ERROR');
    this.received = received;
    this.expected = expected;
    this.example = example;
  }
}

export class ValidationError extends HookedApiError {
  constructor(message, { field, value, validValues } = {}) {
    super(message, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
    this.validValues = validValues;
  }
}

export class PluginError extends HookedApiError {
  constructor(message, { pluginName, installedPlugins } = {}) {
    super(message, 'PLUGIN_ERROR');
    this.pluginName = pluginName;
    this.installedPlugins = installedPlugins;
  }
}

export class ScopeError extends HookedApiError {
  constructor(message, { scopeName, availableScopes } = {}) {
    super(message, 'SCOPE_ERROR');
    this.scopeName = scopeName;
    this.availableScopes = availableScopes;
  }
}

export class MethodError extends HookedApiError {
  constructor(message, { methodName, suggestion } = {}) {
    super(message, 'METHOD_ERROR');
    this.methodName = methodName;
    this.suggestion = suggestion;
  }
}

export class Api {
  constructor(options = {}, customizeOptions = {}) {
    // Default logging configuration
    const defaultLogging = {
      level: 'info',
      format: 'pretty',
      timestamp: true,
      colors: true,
      logger: console
    };
    
    this.options = {
      name: null,
      version: '1.0.0',
      ...options
    }
    
    // Properly merge logging options
    this.options.logging = { ...defaultLogging, ...(options.logging || {}) }

    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      const received = this.options.name === undefined ? 'undefined' : 
                      this.options.name === null ? 'null' : 
                      this.options.name === '' ? 'empty string' :
                      `${typeof this.options.name} "${this.options.name}"`;
      throw new ConfigurationError(
        `API instance must have a non-empty name property. Received: ${received}. Example: new Api({ name: 'my-api', version: '1.0.0' })`,
        { 
          received: this.options.name,
          expected: 'non-empty string',
          example: "new Api({ name: 'my-api', version: '1.0.0' })"
        }
      );
    }
    if (!semver.valid(this.options.version)) {
      const versionType = typeof this.options.version;
      const suggestion = versionType === 'string' ? 
        `Did you mean '${this.options.version}.0' or '${this.options.version}.0.0'?` :
        `Version must be a string in semver format (e.g., '1.0.0', '2.1.3').`;
      throw new ConfigurationError(
        `Invalid version format for API '${this.options.name}'. Received: ${versionType === 'string' ? `'${this.options.version}'` : versionType}. ${suggestion}`,
        {
          received: this.options.version,
          expected: 'semver format (e.g., 1.0.0)',
          example: "{ version: '1.0.0' }"
        }
      );
    }

    // All internal state with underscore prefix
    this._hooks = new Map()
    this._vars = new Map()
    this._helpers = new Map()
    this._apiMethods = new Map()
    this._scopeMethods = new Map()
    this._installedPlugins = new Set()
    this._scopes = new Map()
    // Store API options (will be frozen when building contexts)
    this._apiOptions = { ...this.options }
    this._pluginOptions = {} // Mutable object for plugin options
    this._scopeAlias = null // Track the scope alias if set
    this._addScopeAlias = null // Track the addScope alias if set
    
    // Initialize logger
    this._logLevel = typeof this.options.logging.level === 'string' ? 
      LOG_LEVEL_VALUES[this.options.logging.level.toLowerCase()] || LogLevel.INFO : 
      this.options.logging.level
    this._logger = this._createLogger()
    
    // Create proxy objects for vars and helpers (only for internal use)
    this._varsProxy = new Proxy({}, {
      get: (target, prop) => this._vars.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return false;
        }
        this._vars.set(prop, value);
        return true;
      }
    })
    this._helpersProxy = new Proxy({}, {
      get: (target, prop) => this._helpers.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return false;
        }
        this._helpers.set(prop, value);
        return true;
      }
    })
    
    // Create proxy for api.scopes.scopeName.methodName() syntax
    this.scopes = new Proxy({}, {
      get: (target, scopeName) => {
        // Prevent prototype pollution and symbol-based bypasses
        if (typeof scopeName === 'symbol' || isDangerousProp(scopeName)) {
          return undefined;
        }
        
        if (!this._scopes.has(scopeName)) return undefined;
        
        // Return another proxy for the methods
        return new Proxy((...args) => {
          throw new MethodError(
            `Direct scope call not supported. Use api.scopes.${scopeName}.methodName() instead`,
            {
              methodName: scopeName,
              suggestion: `api.scopes.${scopeName}.methodName()`
            }
          );
        }, {
          get: (target, prop) => {
            // Only non-numeric string props, so that scope.users[123] returns undefined
            if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
              const scopeConfig = this._scopes.get(scopeName);
              if (!scopeConfig) {
                return undefined;
              }
              
              // Find handler - check scope-specific methods first, then global scope methods
              const handler = scopeConfig._scopeMethods?.get(prop) || this._scopeMethods.get(prop);
              if (!handler) {
                return undefined; // No method found
              }
              
              return async (params = {}) => {
                const startTime = Date.now();
                const methodContext = `${scopeName}.${prop}`;
                
                this._logger.debug(`Scope method '${prop}' called on '${scopeName}'`, { params });
                
                // Create a mutable context for this method call
                const context = {};
                
                // Get the scope-aware context
                const scopeContext = this._buildScopeContext(scopeName);
                
                const handlerParams = { 
                  // User data
                  params,
                  context,
                  
                  // Data access (scope-aware)
                  vars: scopeContext.vars,
                  helpers: scopeContext.helpers,
                  scope: scopeContext.scopes[scopeName],  // The current scope object
                  scopes: scopeContext.scopes,            // All scopes proxy
                  
                  // Capabilities
                  runHooks: (name) => scopeContext.runHooks(name, context, params),
                  log: scopeContext.log,
                  
                  // Metadata
                  name: prop,
                  apiOptions: scopeContext.apiOptions,
                  pluginOptions: scopeContext.pluginOptions,
                  scopeOptions: scopeContext.scopeOptions,
                  scopeName: scopeName
                };
                
                // Add alias if one is set (alias is for the collection)
                if (this._scopeAlias) {
                  handlerParams[this._scopeAlias] = scopeContext.scopes;
                }
                
                try {
                  const result = await handler(handlerParams);
                  const duration = Date.now() - startTime;
                  this._logger.debug(`Scope method '${prop}' on '${scopeName}' completed`, { duration: `${duration}ms` });
                  return result;
                } catch (error) {
                  const duration = Date.now() - startTime;
                  this._logger.error(`Scope method '${prop}' on '${scopeName}' failed`, { error: error.message, duration: `${duration}ms` });
                  throw error;
                }
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
    
    // Keep use, customize, and addScope as public methods
    this.use = this.use.bind(this);
    this.customize = this.customize.bind(this);
    this.addScope = this._addScope.bind(this);
    this.setScopeAlias = this._setScopeAlias.bind(this);
    
    // Create the proxy first
    const proxy = new Proxy(this, {
      get(target, prop, receiver) {
        // Check apiMethods first
        if (target._apiMethods.has(prop)) {
          return async (params = {}) => {
            const startTime = Date.now();
            const handler = target._apiMethods.get(prop);
            
            target._logger.debug(`API method '${prop}' called`, { params });
            
            // Create a mutable context for this method call
            const context = {};
            
            // Create logger for this context
            const log = target._createContextLogger(prop);
            
            // Create flattened handler context
            const handlerParams = { 
              // User data
              params,
              context,
              
              // Data access
              vars: target._varsProxy,
              helpers: target._helpersProxy,
              scope: null,           // No current scope for global methods
              scopes: target.scopes,  // All scopes proxy
              
              // Capabilities
              runHooks: (name) => target._runHooks(name, context, params),
              log,
              
              // Metadata
              name: prop,
              apiOptions: Object.freeze({ ...target._apiOptions }),
              pluginOptions: Object.freeze({ ...target._pluginOptions })
              // No scopeName or scopeOptions for global methods
            };
            
            // Add alias if one is set
            if (target._scopeAlias) {
              handlerParams[target._scopeAlias] = target.scopes;
            }
            
            try {
              const result = await handler(handlerParams);
              const duration = Date.now() - startTime;
              target._logger.debug(`API method '${prop}' completed`, { duration: `${duration}ms` });
              return result;
            } catch (error) {
              const duration = Date.now() - startTime;
              target._logger.error(`API method '${prop}' failed`, { error: error.message, duration: `${duration}ms` });
              throw error;
            }
          };
        }
        // Fall back to actual properties
        return Reflect.get(target, prop, receiver);
      }
    });
    
    // Apply customize options if provided
    const { hooks, apiMethods, scopeMethods, vars, helpers } = customizeOptions;
    if (hooks || apiMethods || scopeMethods || vars || helpers) {
      proxy.customize(customizeOptions);
    }
    
    return proxy;
  }
  
  _createLogger() {
    const apiName = this.options.name;
    const loggingOpts = this.options.logging;
    const customLogger = loggingOpts.logger;
    
    const log = (level, message, data, context) => {
      // Check if this log level is enabled
      if (level < this._logLevel) return;
      
      const levelName = LOG_LEVEL_NAMES[level];
      const timestamp = loggingOpts.timestamp ? new Date().toISOString() : '';
      
      // Build the log prefix
      let prefix = '';
      if (loggingOpts.format === 'pretty' && loggingOpts.colors && customLogger === console) {
        const color = LOG_COLORS[levelName];
        prefix = `${color}[${levelName}]${COLORS.reset}`;
        if (context) {
          prefix += ` ${COLORS.cyan}[${apiName}${context ? ':' + context : ''}]${COLORS.reset}`;
        } else {
          prefix += ` ${COLORS.cyan}[${apiName}]${COLORS.reset}`;
        }
      } else {
        prefix = `[${levelName}] [${apiName}${context ? ':' + context : ''}]`;
      }
      
      if (timestamp) {
        prefix = `${timestamp} ${prefix}`;
      }
      
      // Format the message
      let output = `${prefix} ${message}`;
      
      // Log based on level
      if (data !== undefined) {
        if (loggingOpts.format === 'json') {
          customLogger.log(JSON.stringify({ level: levelName, api: apiName, context, message, data, timestamp }));
        } else {
          if (level === LogLevel.ERROR) {
            customLogger.error(output, data);
          } else if (level === LogLevel.WARN) {
            customLogger.warn(output, data);
          } else {
            customLogger.log(output, data);
          }
        }
      } else {
        if (loggingOpts.format === 'json') {
          customLogger.log(JSON.stringify({ level: levelName, api: apiName, context, message, timestamp }));
        } else {
          if (level === LogLevel.ERROR) {
            customLogger.error(output);
          } else if (level === LogLevel.WARN) {
            customLogger.warn(output);
          } else {
            customLogger.log(output);
          }
        }
      }
    };
    
    return {
      error: (msg, data, ctx) => log(LogLevel.ERROR, msg, data, ctx),
      warn: (msg, data, ctx) => log(LogLevel.WARN, msg, data, ctx),
      info: (msg, data, ctx) => log(LogLevel.INFO, msg, data, ctx),
      debug: (msg, data, ctx) => log(LogLevel.DEBUG, msg, data, ctx),
      trace: (msg, data, ctx) => log(LogLevel.TRACE, msg, data, ctx)
    };
  }
  
  _createContextLogger(contextName, scopeLogLevel = null) {
    // Check if we should use scope-specific log level
    const effectiveLogLevel = scopeLogLevel !== null ? scopeLogLevel : this._logLevel;
    
    const log = (level, msg, data) => {
      if (level < effectiveLogLevel) return;
      this._logger[LOG_LEVEL_NAMES[level].toLowerCase()](msg, data, contextName);
    };
    
    const logger = (msg, data) => log(LogLevel.INFO, msg, data);
    logger.error = (msg, data) => log(LogLevel.ERROR, msg, data);
    logger.warn = (msg, data) => log(LogLevel.WARN, msg, data);
    logger.info = (msg, data) => log(LogLevel.INFO, msg, data);
    logger.debug = (msg, data) => log(LogLevel.DEBUG, msg, data);
    logger.trace = (msg, data) => log(LogLevel.TRACE, msg, data);
    
    return logger;
  }

  _register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    if (globalRegistry.get(name).has(version)) {
      const existingVersions = Array.from(globalRegistry.get(name).keys()).sort(semver.rcompare);
      throw new ConfigurationError(
        `API '${name}' version '${version}' is already registered. Existing versions: ${existingVersions.join(', ')}. Use a different version number or get the existing instance with Api.registry.get('${name}', '${version}').`,
        {
          received: version,
          expected: 'unique version number',
          example: `Api.registry.get('${name}', '${version}')`
        }
      );
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
    if (!pluginName?.trim()) {
      const received = pluginName === undefined ? 'undefined' : pluginName === null ? 'null' : `empty string "${pluginName}"`;
      throw new ValidationError(
        `Hook '${hookName}' requires a valid plugin name. Received: ${received}. Plugin name must be a non-empty string.`,
        {
          field: 'pluginName',
          value: pluginName,
          validValues: 'non-empty string'
        }
      );
    }
    if (!functionName?.trim()) {
      const received = functionName === undefined ? 'undefined' : functionName === null ? 'null' : `empty string "${functionName}"`;
      throw new ValidationError(
        `Hook '${hookName}' requires a valid function name. Received: ${received}. Function name must be a non-empty string.`,
        {
          field: 'functionName',
          value: functionName,
          validValues: 'non-empty string'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Hook '${hookName}' handler must be a function. Received: ${typeof handler}. Example: addHook('hookName', 'pluginName', 'functionName', {}, async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      );
    }

    const placements = [hookAddOptions.beforePlugin, hookAddOptions.afterPlugin, hookAddOptions.beforeFunction, hookAddOptions.afterFunction].filter(Boolean);
    if (placements.length > 1) {
      const specified = [];
      if (hookAddOptions.beforePlugin) specified.push(`beforePlugin: '${hookAddOptions.beforePlugin}'`);
      if (hookAddOptions.afterPlugin) specified.push(`afterPlugin: '${hookAddOptions.afterPlugin}'`);
      if (hookAddOptions.beforeFunction) specified.push(`beforeFunction: '${hookAddOptions.beforeFunction}'`);
      if (hookAddOptions.afterFunction) specified.push(`afterFunction: '${hookAddOptions.afterFunction}'`);
      throw new ValidationError(
        `Hook '${hookName}' can only specify one placement parameter, but got ${placements.length}: ${specified.join(', ')}. Use only one of: beforePlugin, afterPlugin, beforeFunction, or afterFunction.`,
        {
          field: 'placement',
          value: specified,
          validValues: ['beforePlugin', 'afterPlugin', 'beforeFunction', 'afterFunction']
        }
      );
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
      // Placement target not found - add to end
      handlers.push(entry)
    } else {
      handlers.splice(index, 0, entry)
    }
    return this
  }

  _buildScopeContext(scopeName) {
    const scopeConfig = this._scopes.get(scopeName);
    if (!scopeConfig) {
      const availableScopes = Array.from(this._scopes.keys());
      const suggestion = availableScopes.length > 0 ? 
        `Available scopes: ${availableScopes.join(', ')}` : 
        'No scopes have been defined. Use api.addScope(name, options) to create a scope first.';
      throw new ScopeError(
        `Scope '${scopeName}' not found. ${suggestion}`,
        {
          scopeName,
          availableScopes
        }
      );
    }
    
    // Merge vars: scope vars take precedence
    const mergedVars = new Map([
      ...this._vars,
      ...scopeConfig._vars
    ]);
    const varsProxy = new Proxy({}, {
      get: (target, prop) => mergedVars.get(prop),
      set: (target, prop, value) => {
        mergedVars.set(prop, value);
        return true;
      }
    });
    
    // Merge helpers: scope helpers take precedence
    const mergedHelpers = new Map([
      ...this._helpers,
      ...scopeConfig._helpers
    ]);
    const helpersProxy = new Proxy({}, {
      get: (target, prop) => mergedHelpers.get(prop),
      set: (target, prop, value) => {
        mergedHelpers.set(prop, value);
        return true;
      }
    });
    
    // Keep options separate and frozen
    
    // Check for scope-specific log level
    const scopeLogLevel = scopeConfig.options?.logging?.level;
    const effectiveLogLevel = scopeLogLevel !== undefined ? 
      (typeof scopeLogLevel === 'string' ? LOG_LEVEL_VALUES[scopeLogLevel.toLowerCase()] : scopeLogLevel) :
      null;
    
    // Create logger for scope context
    const log = this._createContextLogger(scopeName, effectiveLogLevel);
    
    // Return flattened context for scope handlers
    return {
      vars: varsProxy,
      helpers: helpersProxy,
      scopes: this.scopes,
      runHooks: (name, context, params) => this._runHooks(name, context, params, scopeName),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions }),
      scopeOptions: scopeConfig.options
    };
  }
  
  _buildGlobalContext() {
    // Create logger for global context
    const log = this._createContextLogger('global');
    
    // Return flattened context for global handlers
    return {
      vars: this._varsProxy,
      helpers: this._helpersProxy,
      scopes: this.scopes,
      runHooks: this._runHooks.bind(this),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions })
    };
  }

  async _runHooks(name, context, params = {}, scopeName = null) {
    const handlers = this._hooks.get(name) || []
    if (handlers.length === 0) {
      this._logger.trace(`No handlers for hook '${name}'${scopeName ? ` in scope '${scopeName}'` : ''}`);
      return context;
    }
    
    const hookContext = scopeName ? `${scopeName}:${name}` : name;
    this._logger.debug(`Running hook '${name}'${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlerCount: handlers.length });
    
    const handlerContext = scopeName ? this._buildScopeContext(scopeName) : this._buildGlobalContext();
    
    let handlerIndex = 0;
    for (const { handler, pluginName, functionName } of handlers) {
      const startTime = Date.now();
      this._logger.trace(`Hook handler '${functionName}' starting`, { plugin: pluginName, hook: name, scope: scopeName });
        // Flatten the handler parameters
        const handlerParams = { 
          // User data
          methodParams: params,
          context,
          
          // Data access
          vars: handlerContext.vars,
          helpers: handlerContext.helpers,
          scope: scopeName ? handlerContext.scopes[scopeName] : null,  // Current scope if in scope context
          scopes: handlerContext.scopes,                        // All scopes proxy
          
          // Capabilities
          runHooks: handlerContext.runHooks,
          log: handlerContext.log,
          
          // Metadata
          name,
          apiOptions: handlerContext.apiOptions,
          pluginOptions: handlerContext.pluginOptions,
          scopeOptions: handlerContext.scopeOptions,
          scopeName
        };
        
        // Add alias if one is set
        if (this._scopeAlias) {
          handlerParams[this._scopeAlias] = handlerContext.scopes;
        }
        
        try {
          const result = await handler(handlerParams);
          const duration = Date.now() - startTime;
          
          if (result === false) {
            this._logger.debug(`Hook handler '${functionName}' stopped chain`, { plugin: pluginName, hook: name, duration: `${duration}ms` });
            break;
          } else {
            this._logger.trace(`Hook handler '${functionName}' completed`, { plugin: pluginName, hook: name, duration: `${duration}ms` });
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          this._logger.error(`Hook handler '${functionName}' failed`, { 
            plugin: pluginName, 
            hook: name, 
            error: error.message, 
            duration: `${duration}ms` 
          });
          throw error;
        }
        
        handlerIndex++;
    }
    
    this._logger.debug(`Hook '${name}' completed${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlersRun: handlerIndex });
    return context;
  }


  _addApiMethod(method, handler) {
    if (!method || typeof method !== 'string') {
      const received = method === undefined ? 'undefined' : 
                      method === null ? 'null' : 
                      method === '' ? 'empty string' :
                      `${typeof method} "${method}"`;
      throw new ValidationError(
        `Method name must be a non-empty string. Received: ${received}. Example: addApiMethod('getData', async (context) => { /* handler */ })`,
        {
          field: 'method',
          value: method,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(method)) {
      const invalidChars = method.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ? 
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Method name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Method name '${method}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: getData, _private, $special, method123`,
        {
          field: 'method',
          value: method,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Implementation for '${method}' must be a function. Received: ${typeof handler}. Example: addApiMethod('${method}', async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      );
    }
    
    // Check if property already exists on the instance or prototype chain
    if (method in this) {
      const propertyType = typeof this[method];
      const suggestion = this._apiMethods.has(method) ? 
        'This method was already defined. Use a different name or remove the previous definition.' :
        `This conflicts with an existing ${propertyType} property. Choose a different method name.`;
      throw new MethodError(
        `Cannot define API method '${method}': property already exists on API instance. ${suggestion}`,
        {
          methodName: method,
          suggestion
        }
      );
    }
    
    this._apiMethods.set(method, handler)
    this._logger.trace(`Added API method '${method}'`);
    return this
  }

  _addScopeMethod(method, handler) {
    if (!method || typeof method !== 'string') {
      const received = method === undefined ? 'undefined' : 
                      method === null ? 'null' : 
                      method === '' ? 'empty string' :
                      `${typeof method} "${method}"`;
      throw new ValidationError(
        `Scope method name must be a non-empty string. Received: ${received}. Example: addScopeMethod('list', async (context) => { /* handler */ })`,
        {
          field: 'method',
          value: method,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(method)) {
      const invalidChars = method.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ? 
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Method name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Scope method name '${method}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: getData, _private, $special, method123`,
        {
          field: 'method', 
          value: method,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Implementation for scope method '${method}' must be a function. Received: ${typeof handler}. Example: addScopeMethod('${method}', async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      )
    }
    
    // Scope methods don't need property conflict checking since they're not on the main API
    this._scopeMethods.set(method, handler)
    this._logger.trace(`Added scope method '${method}'`);
    return this
  }

  customize({ hooks = {}, apiMethods = {}, scopeMethods = {}, vars = {}, helpers = {} } = {}) {
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
        const received = hookDef === undefined ? 'undefined' : 
                        hookDef === null ? 'null' : 
                        `${typeof hookDef}`;
        throw new ValidationError(
          `Hook '${hookName}' must be a function or object. Received: ${received}. Examples:\n` +
          `  As function: hooks: { myHook: async (context) => { /* code */ } }\n` +
          `  As object: hooks: { myHook: { handler: async (context) => { /* code */ }, beforePlugin: 'other-plugin' } }`,
          {
            field: 'hookDef',
            value: hookDef,
            validValues: 'function or object'
          }
        )
      }
      
      if (typeof handler !== 'function') {
        const received = handler === undefined ? 'undefined' : `${typeof handler}`;
        throw new ValidationError(
          `Hook '${hookName}' must have a function handler. Received: ${received}. ` +
          `When using object syntax, provide: { handler: async (context) => { /* code */ } }`,
          {
            field: 'handler',
            value: handler,
            validValues: 'function'
          }
        )
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

    // Process scopeMethods
    for (const [methodName, handler] of Object.entries(scopeMethods)) {
      this._addScopeMethod(methodName, handler);
    }

    return this;
  }

  _addScope(name, options = {}, extras = {}) {
    if (!name || typeof name !== 'string') {
      const received = name === undefined ? 'undefined' : 
                      name === null ? 'null' : 
                      name === '' ? 'empty string' :
                      `${typeof name} "${name}"`;
      throw new ValidationError(
        `Scope name must be a non-empty string. Received: ${received}. Example: api.addScope('users', { /* options */ })`,
        {
          field: 'name',
          value: name,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(name)) {
      const invalidChars = name.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ? 
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Scope name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Scope name '${name}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: users, _private, $special, scope123`,
        {
          field: 'name',
          value: name,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (this._scopes.has(name)) {
      const existingScopes = Array.from(this._scopes.keys());
      throw new ScopeError(
        `Scope '${name}' already exists. Existing scopes: ${existingScopes.join(', ')}. Use a different name or remove the existing scope first.`,
        {
          scopeName: name,
          availableScopes: existingScopes
        }
      );
    }
    
    const { hooks = {}, apiMethods = {}, scopeMethods = {}, vars = {}, helpers = {} } = extras;
    
    // Log what's being added
    const additions = [];
    if (Object.keys(hooks).length > 0) additions.push(`${Object.keys(hooks).length} hooks`);
    if (Object.keys(apiMethods).length > 0) additions.push(`${Object.keys(apiMethods).length} api methods`);
    if (Object.keys(scopeMethods).length > 0) additions.push(`${Object.keys(scopeMethods).length} scope methods`);
    if (Object.keys(vars).length > 0) additions.push(`${Object.keys(vars).length} vars`);
    if (Object.keys(helpers).length > 0) additions.push(`${Object.keys(helpers).length} helpers`);
    
    if (additions.length > 0) {
      this._logger.trace(`Scope '${name}' includes: ${additions.join(', ')}`);
    }
    
    // Process scope hooks - wrap them to only run for this scope
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
        const received = hookDef === undefined ? 'undefined' : 
                        hookDef === null ? 'null' : 
                        `${typeof hookDef}`;
        throw new ValidationError(
          `Hook '${hookName}' in scope '${name}' must be a function or object. Received: ${received}. Examples:\n` +
          `  As function: hooks: { myHook: async (context) => { /* code */ } }\n` +
          `  As object: hooks: { myHook: { handler: async (context) => { /* code */ }, beforePlugin: 'other-plugin' } }`,
          {
            field: 'hookDef',
            value: hookDef,
            validValues: 'function or object'
          }
        )
      }
      
      if (typeof handler !== 'function') {
        const received = handler === undefined ? 'undefined' : `${typeof handler}`;
        throw new ValidationError(
          `Hook '${hookName}' in scope '${name}' must have a function handler. Received: ${received}. ` +
          `When using object syntax, provide: { handler: async (context) => { /* code */ } }`,
          {
            field: 'handler',
            value: handler,
            validValues: 'function'
          }
        )
      }
      
      // Wrap handler to only run for this scope
      const scopeName = name; // Capture scope name in closure
      const wrappedHandler = (handlerParams) => {
        if (handlerParams.scopeName === scopeName) {
          return handler(handlerParams);
        }
      };
      
      this._addHook(hookName, `scope:${name}`, functionName, hookAddOptions, wrappedHandler)
      this._logger.trace(`Added scope-specific hook '${hookName}' for scope '${name}'`);
    }
    
    // Store scope configuration with underscore prefix for internal properties
    this._scopes.set(name, {
      options: Object.freeze({ ...options }),
      _apiMethods: new Map(Object.entries(apiMethods)),
      _scopeMethods: new Map(Object.entries(scopeMethods)),
      _vars: new Map(Object.entries(vars)),
      _helpers: new Map(Object.entries(helpers))
    });
    
    this._logger.info(`Scope '${name}' added successfully`);
    return this;
  }

  _setScopeAlias(aliasName, addScopeAlias = null) {
    if (aliasName !== null || addScopeAlias !== null) {
      this._logger.debug(`Setting scope aliases`, { scopeAlias: aliasName, addScopeAlias });
    }
    
    // Handle scopes alias
    if (aliasName !== null) {
      if (typeof aliasName !== 'string' || !aliasName.trim()) {
        const received = aliasName === undefined ? 'undefined' : 
                        aliasName === '' ? 'empty string' :
                        `${typeof aliasName} "${aliasName}"`;
        throw new ValidationError(
          `Alias name must be a non-empty string. Received: ${received}. Example: api.setScopeAlias('resources')`,
          {
            field: 'aliasName',
            value: aliasName,
            validValues: 'non-empty string'
          }
        );
      }
      if (aliasName in this) {
        const propertyType = typeof this[aliasName];
        throw new ConfigurationError(
          `Cannot set scope alias '${aliasName}': property already exists on API instance (${propertyType}). Choose a different alias name.`,
          {
            received: aliasName,
            expected: 'unique property name',
            example: "api.setScopeAlias('resources')"
          }
        );
      }
      // Store the alias name
      this._scopeAlias = aliasName;
      // Create alias that points to the same proxy
      Object.defineProperty(this, aliasName, {
        get: () => this.scopes,
        enumerable: true,
        configurable: true
      });
    }
    
    // Handle addScope alias
    if (addScopeAlias !== null) {
      if (typeof addScopeAlias !== 'string' || !addScopeAlias.trim()) {
        const received = addScopeAlias === undefined ? 'undefined' : 
                        addScopeAlias === '' ? 'empty string' :
                        `${typeof addScopeAlias} "${addScopeAlias}"`;
        throw new ValidationError(
          `addScope alias must be a non-empty string. Received: ${received}. Example: api.setScopeAlias('resources', 'addResource')`,
          {
            field: 'addScopeAlias',
            value: addScopeAlias,
            validValues: 'non-empty string'
          }
        );
      }
      if (addScopeAlias in this) {
        const propertyType = typeof this[addScopeAlias];
        throw new ConfigurationError(
          `Cannot set addScope alias '${addScopeAlias}': property already exists on API instance (${propertyType}). Choose a different alias name.`,
          {
            received: addScopeAlias,
            expected: 'unique property name',
            example: "api.setScopeAlias('resources', 'addResource')"
          }
        );
      }
      // Store the addScope alias name
      this._addScopeAlias = addScopeAlias;
      // Create alias that points to the addScope method
      Object.defineProperty(this, addScopeAlias, {
        get: () => this.addScope,
        enumerable: true,
        configurable: true
      });
    }
    
    return this;
  }



  use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) {
      const received = plugin === undefined ? 'undefined' : 
                      plugin === null ? 'null' : 
                      `${typeof plugin}`;
      throw new PluginError(
        `Plugin must be an object. Received: ${received}. Example: api.use({ name: 'my-plugin', install: (context) => { /* setup */ } })`,
        {
          pluginName: 'unknown',
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      const received = plugin.name === undefined ? 'undefined (missing name property)' : 
                      plugin.name === null ? 'null' : 
                      plugin.name === '' ? 'empty string' :
                      `${typeof plugin.name} "${plugin.name}"`;
      throw new PluginError(
        `Plugin must have a non-empty name property. Received: ${received}. Example: { name: 'my-plugin', install: (context) => { /* setup */ } }`,
        {
          pluginName: 'unknown',
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }
    if (typeof plugin.install !== 'function') {
      const received = plugin.install === undefined ? 'undefined (missing install property)' : `${typeof plugin.install}`;
      throw new PluginError(
        `Plugin '${plugin.name}' must have an install function. Received: ${received}. Example: { name: '${plugin.name}', install: (context) => { /* setup code */ } }`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }

    if (plugin.name === 'api' || plugin.name === 'scopes') {
      throw new PluginError(
        `Plugin name '${plugin.name}' is reserved. These names are used internally by the API. Choose a different name like '${plugin.name}-plugin' or 'custom-${plugin.name}'.`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }

    if (this._installedPlugins.has(plugin.name)) {
      const installedPlugins = Array.from(this._installedPlugins);
      throw new PluginError(
        `Plugin '${plugin.name}' is already installed on API '${this.options.name}'. Installed plugins: ${installedPlugins.join(', ')}. Each plugin can only be installed once.`,
        {
          pluginName: plugin.name,
          installedPlugins
        }
      );
    }

    const dependencies = plugin.dependencies || []
    if (dependencies.length > 0) {
      this._logger.debug(`Checking dependencies for plugin '${plugin.name}'`, { dependencies });
    }
    
    for (const depName of dependencies) {
      if (!this._installedPlugins.has(depName)) {
        const installedPlugins = Array.from(this._installedPlugins);
        const suggestion = installedPlugins.length > 0 ? 
          `Installed plugins: ${installedPlugins.join(', ')}` : 
          'No plugins are currently installed';
        throw new PluginError(
          `Plugin '${plugin.name}' requires dependency '${depName}' which is not installed. ${suggestion}. Install '${depName}' first using api.use(${depName}Plugin).`,
          {
            pluginName: plugin.name,
            installedPlugins
          }
        );
      }
    }

    this._logger.info(`Installing plugin '${plugin.name}'`, { options });
    const startTime = Date.now();
    
    try {
      // Store plugin options separately
      this._pluginOptions[plugin.name] = Object.freeze(options)
      
      // Create logger for plugin context
      const log = this._createContextLogger(`plugin:${plugin.name}`);
      
      // Create flattened install context
      const api = this; // Capture this reference
      const installContext = {
        // Setup methods
        addApiMethod: (method, handler) => {
          if (api._logger) {
            api._logger.trace(`Plugin '${plugin.name}' adding API method '${method}'`);
          }
          return api._addApiMethod.call(api, method, handler);
        },
        addScopeMethod: (method, handler) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope method '${method}'`);
          return api._addScopeMethod(method, handler);
        },
        addScope: (name, options, extras) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope '${name}'`);
          return api._addScope(name, options, extras);
        },
        setScopeAlias: (aliasName, addScopeAlias) => {
          api._logger.trace(`Plugin '${plugin.name}' setting scope alias '${aliasName}'`);
          return api._setScopeAlias(aliasName, addScopeAlias);
        },
        runHooks: this._runHooks.bind(this),
        
        // Special addHook that injects plugin name
        addHook: (hookName, functionName, hookAddOptions, handler) => {
          this._logger.trace(`Plugin '${plugin.name}' adding hook '${hookName}' with function '${functionName}'`);
          return this._addHook(hookName, plugin.name, functionName, hookAddOptions || {}, handler);
        },
        
        // Data access
        vars: this._varsProxy,
        helpers: this._helpersProxy,
        scopes: this.scopes,
        
        // Logging
        log,
        
        // Plugin info
        name: plugin.name,
        apiOptions: Object.freeze({ ...this._apiOptions }),
        pluginOptions: Object.freeze({ ...this._pluginOptions }),
        context: {}
      };
      
      plugin.install(installContext)
      this._installedPlugins.add(plugin.name)
      
      const duration = Date.now() - startTime;
      this._logger.info(`Plugin '${plugin.name}' installed successfully`, { duration: `${duration}ms` });
    } catch (error) {
      const duration = Date.now() - startTime;
      this._logger.error(`Failed to install plugin '${plugin.name}'`, { error: error.message, duration: `${duration}ms` });
      throw new PluginError(
        `Failed to install plugin '${plugin.name}': ${error.message}`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      )
    }
    return this
  }
}

export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}