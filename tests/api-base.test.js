// api-base.test.js - EXTENDED VERSION
// To run this:
// 1. Make sure you have 'semver' installed: npm install semver
// 2. Make sure your Api class is in '../api.js' (or adjust path)
// 3. Run: node --test tests/api-base.test.js

import { test, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
// Adjust path if api.js is elsewhere
import { Api, resetGlobalRegistryForTesting } from '../api.js'

// --- Custom Expect Wrapper for node:assert ---
// This provides a Jest-like 'expect' syntax over Node's built-in 'assert'
const expect = (actual) => ({
  toBe: (expected) => {
    assert.strictEqual(actual, expected, `Expected ${expected}, but got ${actual}`)
  },
  toEqual: (expected) => {
    // Using deepStrictEqual for object/array comparison
    assert.deepStrictEqual(actual, expected, `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`)
  },
  toBeTruthy: () => {
    // Allows checking for Proxy objects. assert.ok performs a truthy check.
    assert.ok(actual, `Expected truthy, but got ${actual}`)
  },
  toBeFalsy: () => {
    assert.strictEqual(!!actual, false, `Expected falsy, but got ${actual}`)
  },
  toBeUndefined: () => {
    assert.strictEqual(actual, undefined, `Expected undefined, but got ${actual}`)
  },
  toBeDefined: () => {
    assert.notStrictEqual(actual, undefined, `Expected defined, but got undefined`)
  },
  toContain: (item) => {
    if (!Array.isArray(actual) && typeof actual === 'string' && !actual.includes(item)) {
        throw new assert.AssertionError({ message: `Expected string "${actual}" to contain "${item}"` })
    } else if (Array.isArray(actual) && !actual.includes(item)) {
        throw new assert.AssertionError({ message: `Expected array ${JSON.stringify(actual)} to contain "${item}"` })
    }
  },
  not: {
    toContain: (item) => {
      if ((Array.isArray(actual) && actual.includes(item)) || (typeof actual === 'string' && actual.includes(item))) {
        throw new assert.AssertionError({ message: `Expected ${actual} NOT to contain ${item}` })
      }
    },
    toBe: (expected) => {
      assert.notStrictEqual(actual, expected, `Expected not ${expected}, but got ${actual}`)
    },
    toThrow: async (expectedErrorMsg) => { // This is for async functions that should NOT throw
      let thrown = false
      let caughtError = null
      try {
        await actual()
      } catch (e) {
        thrown = true
        caughtError = e
      }
      if (!thrown) {
        return // Test passes if no error was thrown, which is the 'not.toThrow' intent
      }
      if (expectedErrorMsg !== undefined && caughtError.message.includes(expectedErrorMsg)) {
        throw new assert.AssertionError({ message: `Expected not to throw "${expectedErrorMsg}", but it did throw "${caughtError.message}"` })
      }
    }
  },
  toThrow: async (expectedErrorMsg) => { // Made async to handle both sync and async throws
    let thrown = false
    let caughtError = null
    try {
      if (typeof actual === 'function') {
        await actual();
      } else {
        throw new assert.AssertionError({ message: '`toThrow` expects a function that throws (sync or async).' });
      }
    } catch (e) {
      thrown = true
      caughtError = e
    }
    if (!thrown) {
      throw new assert.AssertionError({ message: 'Function did not throw an error' })
    }
    if (expectedErrorMsg !== undefined && !caughtError.message.includes(expectedErrorMsg)) {
      throw new assert.AssertionError({ message: `Expected error message to include "${expectedErrorMsg}", but got "${caughtError.message}"` })
    }
  },
  toHaveLength: (len) => {
    assert.strictEqual(actual.length, len, `Expected length ${len}, but got ${actual.length}`)
  }
})


// --- Test Utilities for Hook Logging ---
let executionLog = []
const clearExecutionLog = () => { executionLog = [] }
const getExecutionLog = () => executionLog

const createLoggedHookHandler = (id) => async (context) => {
  executionLog.push(id)
  context.log = context.log ? context.log + id : id // Modify context for state checks
  // console.log(`Executing: ${id}`); // Uncomment for verbose test logging
  return true // Don't stop chain by default
}
const createStoppingHookHandler = (id) => async (context) => {
  executionLog.push(id)
  context.log = context.log ? context.log + id : id
  return false // Stop chain
}


// --- Test Suites ---

describe('Api Class Core Functionality', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting() // Reset global state
    clearExecutionLog() // Reset hook execution log
  })

  test('Constructor should initialize with provided options', () => {
    const api = new Api({ name: 'my-api', version: '1.0.0', custom: true })
    expect(api.options.name).toBe('my-api')
    expect(api.options.version).toBe('1.0.0')
    expect(api.options.custom).toBe(true)
  })

  test('Constructor should auto-register if name and version are provided', () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    expect(Api.registry.has('test-api', '1.0.0')).toBeTruthy()
    expect(Api.registry.get('test-api', '1.0.0')).toBe(api)
  })

  test('Constructor should throw error if name is missing or invalid', async () => {
    await expect(async () => new Api({ name: null, version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.')
    await expect(async () => new Api({ name: '', version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.')
    await expect(async () => new Api({ version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.')
    await expect(async () => new Api({})).toThrow('API instance must have a non-empty "name" property.')
  })

  test('Constructor should throw error if version format is invalid', async () => {
    await expect(async () => new Api({ name: 'invalid-ver-test', version: '1.x.0' })).toThrow("Invalid version format '1.x.0'")
    await expect(async () => new Api({ name: 'invalid-ver-test', version: 'beta' })).toThrow("Invalid version format 'beta'")
  })

  test('register() should successfully register an API instance', () => {
    const api = new Api({ name: 'my-service', version: '1.0.0' })
    api.register()
    expect(Api.registry.has('my-service', '1.0.0')).toBeTruthy()
    expect(Api.registry.get('my-service', '1.0.0')).toBe(api)
  })

  test('register() should return the API instance for chaining', () => {
    const api = new Api({ name: 'chain-test', version: '1.0.0' })
    expect(api.register()).toBe(api)
  })

  test('register() should register multiple versions of the same API', () => {
    const api1 = new Api({ name: 'multi-ver', version: '1.0.0' })
    const api2 = new Api({ name: 'multi-ver', version: '1.1.0' })
    expect(Api.registry.has('multi-ver', '1.0.0')).toBeTruthy()
    expect(Api.registry.has('multi-ver', '1.1.0')).toBeTruthy()
    assert.strictEqual(Api.registry.versions('multi-ver').length, 2, 'Expected 2 versions for multi-ver API')
  })

  test('register() should handle registering the same API instance twice gracefully (no error, just overwrites itself)', () => {
    const api = new Api({ name: 're-reg', version: '1.0.0' })
    expect(() => api.register()).not.toThrow()
    expect(Api.registry.has('re-reg', '1.0.0')).toBeTruthy()
  })

  test('implement() and execute() should successfully implement a method', () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    const handler = (ctx) => 'result'
    api.implement('testMethod', handler)
    expect(api.implementers.has('testMethod')).toBeTruthy()
    expect(api.implementers.get('testMethod')).toBe(handler)
  })

  test('implement() and execute() should return the API instance for chaining implement', () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    const handler = (ctx) => {}
    expect(api.implement('chain', handler)).toBe(api)
  })

  test('implement() and execute() should throw error if implement handler is not a function', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    await expect(async () => api.implement('badMethod', 'not-a-function')).toThrow('Implementation for \'badMethod\' must be a function.')
  })

  test('implement() and execute() should execute an implemented method and return its result', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    api.implement('getData', async (ctx) => ctx.id * 2)
    const result = await api.execute('getData', { id: 5 })
    expect(result).toBe(10)
  })

  test('implement() and execute() should execute an implemented method with complex context modification', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    api.implement('processData', async (ctx) => {
      ctx.processed = true
      ctx.data = ctx.data.map(x => x + 1)
      return ctx.data.length
    })
    const context = { data: [1, 2, 3] }
    const result = await api.execute('processData', context)
    expect(context.processed).toBe(true)
    expect(context.data).toEqual([2, 3, 4])
    expect(result).toBe(3)
  })

  test('implement() and execute() should overwrite an existing implementation', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    const handler1 = async (ctx) => 'first'
    const handler2 = async (ctx) => 'second'
    api.implement('overwrittenMethod', handler1)
    api.implement('overwrittenMethod', handler2)
    const result = await api.execute('overwrittenMethod', {})
    expect(result).toBe('second')
    expect(api.implementers.get('overwrittenMethod')).toBe(handler2)
  })

  test('implement() and execute() should throw error if executing a non-existent method', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    await expect(async () => api.execute('nonExistentMethod', {})).toThrow('No implementation found for method: nonExistentMethod')
  })
})

describe('Api.registry Static Functionality', () => {
  let apiV1, apiV2, apiV3, apiBeta
  beforeEach(() => {
    resetGlobalRegistryForTesting() // Reset global state
    apiV1 = new Api({ name: 'my-lib', version: '1.0.0' })
    apiV2 = new Api({ name: 'my-lib', version: '1.2.3' })
    apiV3 = new Api({ name: 'my-lib', version: '2.0.0' })
    apiBeta = new Api({ name: 'my-lib', version: '1.5.0-beta' })
    new Api({ name: 'other-lib', version: '0.5.0' }) // Auto-registers
  })

  test('registry.get() should return null for non-existent API name', () => {
    expect(Api.registry.get('non-existent')).toBe(null)
  })

  test('registry.get() should return null for non-existent exact version of existing API', () => {
    expect(Api.registry.get('my-lib', '9.9.9')).toBe(null)
  })

  test('registry.get() should return correct API instance for exact version match', () => {
    expect(Api.registry.get('my-lib', '1.2.3')).toBe(apiV2)
    expect(Api.registry.get('my-lib', '2.0.0')).toBe(apiV3)
  })

  test('registry.get() should return the latest version when "latest" is requested', () => {
    expect(Api.registry.get('my-lib', 'latest')).toBe(apiV3)
  })

  test('registry.get() should return the latest version when "latest" is requested for API with only one version', () => {
    const singleApi = new Api({ name: 'single-lib', version: '1.0.0' })
    expect(Api.registry.get('single-lib', 'latest')).toBe(singleApi)
  })

  test('registry.get() should handle semver range satisfaction (^)', () => {
    expect(Api.registry.get('my-lib', '^1.0.0')).toEqual(apiV2)
  })

  test('registry.get() should return exact match when no operators and exact version exists', () => {
    expect(Api.registry.get('my-lib', '1.0.0')).toBe(apiV1)
  })

  test('registry.get() should return null for incompatible semver range', () => {
    expect(Api.registry.get('my-lib', '^3.0.0')).toBe(null)
  })

  test('registry.get() should return correct compatible version for >= operator (if no exact match and range not used)', () => {
    expect(Api.registry.get('my-lib', '1.1.0')).toBe(apiV3)
  })

  test('registry.get() should return null if compatible version with >= operator is not found', () => {
    expect(Api.registry.get('my-lib', '2.1.0')).toBe(null)
  })

  test('registry.find() should behave identically to registry.get() for exact match', () => {
    expect(Api.registry.find('my-lib', '1.2.3')).toBe(apiV2)
  })
  test('registry.find() should behave identically to registry.get() for latest', () => {
    expect(Api.registry.find('my-lib', 'latest')).toBe(apiV3)
  })

  test('registry.list() should return an empty object if no APIs are registered', () => {
    resetGlobalRegistryForTesting()
    expect(Api.registry.list()).toEqual({})
  })

  test('registry.list() should list all registered API names with their sorted versions', () => {
    const listed = Api.registry.list()
    expect(Object.keys(listed)).toContain('my-lib')
    expect(Object.keys(listed)).toContain('other-lib')
    expect(listed['my-lib']).toEqual(['2.0.0', '1.5.0-beta', '1.2.3', '1.0.0'])
    expect(listed['other-lib']).toEqual(['0.5.0'])
  })

  test('registry.list() should handle multiple APIs correctly', () => {
    new Api({ name: 'another-lib', version: '1.0.0' })
    const listed = Api.registry.list()
    assert.strictEqual(Object.keys(listed).length, 3, 'Expected 3 APIs in the registry list');
  })

  test('registry.has() should return true if API name exists', () => {
    expect(Api.registry.has('my-lib')).toBeTruthy()
  })

  test('registry.has() should return false if API name does not exist', () => {
    expect(Api.registry.has('non-existent-api')).toBeFalsy()
  })

  test('registry.has() should return true if specific version exists', () => {
    expect(Api.registry.has('my-lib', '1.0.0')).toBeTruthy()
    expect(Api.registry.has('my-lib', '2.0.0')).toBeTruthy()
  })

  test('registry.has() should return false if specific version does not exist', () => {
    expect(Api.registry.has('my-lib', '9.9.9')).toBeFalsy()
  })

  test('registry.has() should return false if checking specific version of non-existent API', () => {
    expect(Api.registry.has('non-existent-api', '1.0.0')).toBeFalsy()
  })

  test('registry.has() should return false for null/undefined name', () => {
    expect(Api.registry.has(null)).toBeFalsy()
    expect(Api.registry.has(undefined)).toBeFalsy()
  })

  test('static versions() should return an empty array if API name does not exist', () => {
    expect(Api.registry.versions('non-existent-api')).toEqual([])
  })

  test('static versions() should return sorted versions for an existing API', () => {
    expect(Api.registry.versions('my-lib')).toEqual(['2.0.0', '1.5.0-beta', '1.2.3', '1.0.0'])
  })
})

describe('Api Class Plugin System (use() method)', () => {
  let api
  beforeEach(async () => {
    resetGlobalRegistryForTesting()
    clearExecutionLog()
    api = new Api({ name: 'plugin-test-api', version: '1.0.0' })
  })

  test('should successfully install a valid plugin without dependencies', async () => {
    const plugin = { name: 'my-plugin', install: (apiInstance, opts, name) => { apiInstance.hook('init', name, 'initFunc', {}, async () => {}) } }
    await api.use(plugin)
    expect(api._installedPlugins.has('my-plugin')).toBeTruthy()
    expect(api.hooks.get('init')[0].pluginName).toBe('my-plugin')
  })

  test('should call plugin.install with correct arguments (api instance, options, plugin name)', async () => {
    let receivedApi, receivedOpts, receivedName
    const plugin = { name: 'test-args', install: (apiInstance, opts, name) => { receivedApi = apiInstance; receivedOpts = opts; receivedName = name } }
    const options = { log: true }
    await api.use(plugin, options)
    expect(receivedApi).toBe(api)
    expect(receivedOpts).toEqual(options)
    expect(receivedName).toBe('test-args')
  })

  test('should throw error if plugin is not an object', async () => {
    await expect(async () => api.use('not-an-object')).toThrow('Plugin must be an object.')
    await expect(async () => api.use(null)).toThrow('Plugin must be an object.')
  })

  test('should throw error if plugin name is missing or invalid', async () => {
    await expect(async () => api.use({ install: () => {} })).toThrow('Plugin must have a non-empty "name" property.')
    await expect(async () => api.use({ name: '', install: () => {} })).toThrow('Plugin must have a non-empty "name" property.')
    await expect(async () => api.use({ name: 123, install: () => {} })).toThrow('Plugin must have a non-empty "name" property.')
  })

  test('should throw error if plugin install function is missing or invalid', async () => {
    await expect(async () => api.use({ name: 'no-install' })).toThrow('Plugin \'no-install\' must have an \'install\' function.')
    await expect(async () => api.use({ name: 'bad-install', install: 'not-a-func' })).toThrow('Plugin \'bad-install\' must have an \'install\' function.')
  })

  test('should throw error if plugin is already installed', async () => {
    const plugin = { name: 'duplicate-plugin', install: () => {} }
    await api.use(plugin)
    await expect(async () => api.use(plugin)).toThrow('Plugin \'duplicate-plugin\' is already installed')
  })

  test('should successfully install a plugin with satisfied dependencies', async () => {
    const depPlugin = { name: 'dep-plugin', install: (apiInstance, opts, name) => { /* noop */ } }
    const mainPlugin = { name: 'main-plugin', dependencies: ['dep-plugin'], install: (apiInstance, opts, name) => { /* noop */ } }
    
    await api.use(depPlugin)
    
    await expect(async () => api.use(mainPlugin)).not.toThrow()
    expect(api._installedPlugins.has('main-plugin')).toBeTruthy()
  })

  test('should throw error if a dependency is missing', async () => {
    const mainPlugin = { name: 'main-plugin', dependencies: ['missing-dep'], install: () => {} }
    await expect(async () => api.use(mainPlugin)).toThrow('requires dependency \'missing-dep\' which is not installed.')
  })

  test('should re-throw error if an error occurs during plugin.install', async () => {
    const plugin = { name: 'error-plugin', install: () => { throw new Error('Simulated install error') } }
    await expect(async () => api.use(plugin)).toThrow('Failed to install plugin \'error-plugin\': Simulated install error')
    expect(api._installedPlugins.has('error-plugin')).toBeFalsy()
  })

  test('should not install plugin if dependency loop (basic check - caught by order)', async () => {
    const p1 = { name: 'p1', install: () => {} }
    const p2 = { name: 'p2', dependencies: ['p1'], install: () => {} }

    await expect(async () => api.use(p2)).toThrow('requires dependency \'p1\' which is not installed.')
    expect(api._installedPlugins.has('p1')).toBeFalsy()
    expect(api._installedPlugins.has('p2')).toBeFalsy()

    await api.use(p1)
    await expect(async () => api.use(p2)).not.toThrow()
    expect(api._installedPlugins.has('p2')).toBeTruthy()
  })
})

describe('Api.hook() Method (Comprehensive Placement)', () => {
  let api
  let logs
  let handlerA, handlerB, handlerC, handlerD
  let pluginA, pluginB, pluginC

  beforeEach(async () => {
    resetGlobalRegistryForTesting()
    clearExecutionLog()
    logs = getExecutionLog()

    api = new Api({ name: 'hook-test-api', version: '1.0.0' })

    handlerA = createLoggedHookHandler('A')
    handlerB = createLoggedHookHandler('B')
    handlerC = createLoggedHookHandler('C')
    handlerD = createLoggedHookHandler('D')

    pluginA = { name: 'pluginA', install: () => {} }
    pluginB = { name: 'pluginB', install: () => {} }
    pluginC = { name: 'pluginC', install: () => {} }

    await api.use(pluginA)
    await api.use(pluginB)
    await api.use(pluginC)
  })

  test('should add hooks in insertion order by default', async () => {
    api.hook('testHook', 'pluginA', 'func1', {}, handlerA)
    api.hook('testHook', 'pluginB', 'func2', {}, handlerB)
    api.hook('testHook', 'pluginA', 'func3', {}, handlerC)
    await api.executeHook('testHook', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should stop execution chain if a handler returns false', async () => {
    api.hook('testStop', 'pluginA', 'func1', {}, handlerA)
    api.hook('testStop', 'pluginB', 'stopFunc', {}, createStoppingHookHandler('STOP'))
    api.hook('testStop', 'pluginC', 'func3', {}, handlerC)
    await api.executeHook('testStop', {})
    expect(logs).toEqual(['A', 'STOP'])
  })

  test('should pass and modify context correctly', async () => {
    const handlerMod1 = async (ctx) => { ctx.value += 1 }
    const handlerMod2 = async (ctx) => { ctx.value *= 2 }
    api.hook('modCtx', 'p1', 'h1', {}, handlerMod1)
    api.hook('modCtx', 'p2', 'h2', {}, handlerMod2)
    const context = { value: 5 }
    await api.executeHook('modCtx', context)
    expect(context.value).toBe(12) // (5 + 1) * 2 = 12
  })

  test('should handle hooks on a non-existent hook name (empty array)', async () => {
    await api.executeHook('nonExistentHook', { log: '' })
    expect(logs).toEqual([])
    expect(getExecutionLog()).toEqual([])
  })

  test('should throw error if pluginName is missing/invalid', async () => {
    await expect(async () => api.hook('test', '', 'func', {}, handlerA)).toThrow('requires a valid \'pluginName\'')
    await expect(async () => api.hook('test', 123, 'func', {}, handlerA)).toThrow('requires a valid \'pluginName\'')
  })

  test('should throw error if functionName is missing/invalid', async () => {
    await expect(async () => api.hook('test', 'p', '', {}, handlerA)).toThrow('requires a valid \'functionName\'')
    await expect(async () => api.hook('test', 'p', null, {}, handlerA)).toThrow('requires a valid \'functionName\'')
  })

  test('should throw error if handler is not a function', async () => {
    await expect(async () => api.hook('test', 'p', 'f', {}, 'not-a-func')).toThrow('must be a function')
  })

  test('should throw error if both beforePlugin and afterPlugin are used', async () => {
    await expect(async () => api.hook('test', 'p', 'f', { beforePlugin: 'p1', afterPlugin: 'p2' }, handlerA)).toThrow('cannot specify both \'beforePlugin\' and \'afterPlugin\'.')
  })

  test('should throw error if both beforeFunction and afterFunction are used', async () => {
    await expect(async () => api.hook('test', 'p', 'f', { beforeFunction: 'f1', afterFunction: 'f2' }, handlerA)).toThrow('cannot specify both \'beforeFunction\' and \'afterFunction\'.')
  })

  test('should throw error if both plugin-level and function-level placement are used', async () => {
    await expect(async () => api.hook('test', 'p', 'f', { beforePlugin: 'p1', beforeFunction: 'f1' }, handlerA)).toThrow('cannot specify both plugin-level and function-level placement parameters.')
  })

  test('should place hook before first handler of target plugin (beforePlugin)', async () => {
    api.hook('orderTest', 'pluginA', 'funcA1', {}, handlerA)
    api.hook('orderTest', 'pluginB', 'funcB1', {}, handlerB)
    api.hook('orderTest', 'pluginA', 'funcA2', {}, handlerC)
    api.hook('orderTest', 'pluginC', 'funcC1', { beforePlugin: 'pluginB' }, handlerD)
    await api.executeHook('orderTest', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should throw if beforePlugin target plugin has no handlers for this hook', async () => {
    await expect(async () => api.hook('emptyTargetHook', 'pluginA', 'funcA', { beforePlugin: 'pluginB_non_existent' }, handlerA))
      .toThrow('\'beforePlugin\' target plugin \'pluginB_non_existent\' not found among existing handlers.')
  })

  test('should place hook after last handler of target plugin (afterPlugin)', async () => {
    api.hook('orderTest', 'pluginA', 'funcA1', {}, handlerA)
    api.hook('orderTest', 'pluginB', 'funcB1', {}, handlerB)
    api.hook('orderTest', 'pluginA', 'funcA2', {}, handlerC)
    api.hook('orderTest', 'pluginC', 'funcC1', { afterPlugin: 'pluginA' }, handlerD)
    await api.executeHook('orderTest', {})
    expect(logs).toEqual(['A', 'B', 'C', 'D'])
  })

  test('should throw if afterPlugin target plugin has no handlers for this hook', async () => {
    await expect(async () => api.hook('emptyTargetHook', 'pluginA', 'funcA', { afterPlugin: 'pluginB_non_existent' }, handlerA))
      .toThrow('\'afterPlugin\' target plugin \'pluginB_non_existent\' not found among existing handlers.')
  })

  test('should place hook before a specific function (beforeFunction)', async () => {
    api.hook('orderFunc', 'p1', 'f1', {}, handlerA)
    api.hook('orderFunc', 'p2', 'f2', {}, handlerB)
    api.hook('orderFunc', 'p3', 'f3', {}, handlerC)
    api.hook('orderFunc', 'p4', 'f4', { beforeFunction: 'f2' }, handlerD)
    await api.executeHook('orderFunc', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should place hook before a specific function from a different plugin', async () => {
    api.hook('interleave', 'pluginA', 'funcA', {}, handlerA)
    api.hook('interleave', 'pluginB', 'funcB', {}, handlerB)
    api.hook('interleave', 'pluginC', 'funcC', {}, handlerC)
    api.hook('interleave', 'pluginD', 'funcD', { beforeFunction: 'funcA' }, handlerD)
    await api.executeHook('interleave', {})
    expect(logs).toEqual(['D', 'A', 'B', 'C'])
  })

  test('should throw if beforeFunction target function not found', async () => {
    await expect(async () => api.hook('targetFuncMissing', 'p1', 'f1', { beforeFunction: 'nonExistentFunc' }, handlerA))
      .toThrow('\'beforeFunction\' target function \'nonExistentFunc\' not found')
  })

  test('should place hook after a specific function (afterFunction)', async () => {
    api.hook('orderFunc', 'p1', 'f1', {}, handlerA)
    api.hook('orderFunc', 'p2', 'f2', {}, handlerB)
    api.hook('orderFunc', 'p3', 'f3', {}, handlerC)
    api.hook('orderFunc', 'p4', 'f4', { afterFunction: 'f2' }, handlerD)
    await api.executeHook('orderFunc', {})
    expect(logs).toEqual(['A', 'B', 'D', 'C'])
  })

  test('should place hook after a specific function from a different plugin', async () => {
    api.hook('interleaveAfter', 'pluginA', 'funcA', {}, handlerA)
    api.hook('interleaveAfter', 'pluginB', 'funcB', {}, handlerB)
    api.hook('interleaveAfter', 'pluginC', 'funcC', {}, handlerC)
    api.hook('interleaveAfter', 'pluginD', 'funcD', { afterFunction: 'funcA' }, handlerD)
    await api.executeHook('interleaveAfter', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should throw if afterFunction target function not found', async () => {
    await expect(async () => api.hook('targetFuncMissing', 'p1', 'f1', { afterFunction: 'nonExistentFunc' }, handlerA))
      .toThrow('\'afterFunction\' target function \'nonExistentFunc\' not found')
  })

  test('should correctly interleave hooks using multiple function-level placements', async () => {
    api.hook('complex', 'p1', 'h1', {}, createLoggedHookHandler('H1'))
    api.hook('complex', 'p2', 'h2', {}, createLoggedHookHandler('H2'))
    api.hook('complex', 'p3', 'h3', {}, createLoggedHookHandler('H3'))
    api.hook('complex', 'p4', 'h4', {}, createLoggedHookHandler('H4'))

    api.hook('complex', 'p5', 'h5', { afterFunction: 'h1' }, createLoggedHookHandler('H5'))
    api.hook('complex', 'p6', 'h6', { beforeFunction: 'h3' }, createLoggedHookHandler('H6'))

    await api.executeHook('complex', {})
    expect(logs).toEqual(['H1', 'H5', 'H2', 'H6', 'H3', 'H4'])
  })

  test('should correctly interleave hooks using mixed plugin and function placements', async () => {
    api.hook('mixedOrder', 'pA', 'fA', {}, createLoggedHookHandler('A'))
    api.hook('mixedOrder', 'pB', 'fB', {}, createLoggedHookHandler('B'))
    api.hook('mixedOrder', 'pC', 'fC', {}, createLoggedHookHandler('C'))

    api.hook('mixedOrder', 'pD', 'fD', { afterPlugin: 'pA' }, createLoggedHookHandler('D'))
    api.hook('mixedOrder', 'pE', 'fE', { beforeFunction: 'fB' }, createLoggedHookHandler('E'))

    await api.executeHook('mixedOrder', {})
    expect(logs).toEqual(['A', 'D', 'E', 'B', 'C'])
  })

  test('should handle multiple placements in sequence for the same target', async () => {
    api.hook('seqOrder', 'p1', 'f1', {}, createLoggedHookHandler('F1'))
    api.hook('seqOrder', 'p2', 'f2', {}, createLoggedHookHandler('F2'))
    api.hook('seqOrder', 'p3', 'f3', { afterFunction: 'f1' }, createLoggedHookHandler('F3'))
    api.hook('seqOrder', 'p4', 'f4', { afterFunction: 'f3' }, createLoggedHookHandler('F4'))
    await api.executeHook('seqOrder', {})
    expect(logs).toEqual(['F1', 'F3', 'F4', 'F2'])
  })

  test('should place correctly when beforePlugin target is at start', async () => {
    api.hook('startPlace', 'pB', 'fB', {}, handlerB)
    api.hook('startPlace', 'pC', 'fC', {}, handlerC)
    api.hook('startPlace', 'pA', 'fA', { beforePlugin: 'pB' }, handlerA)
    await api.executeHook('startPlace', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when afterPlugin target is at end', async () => {
    api.hook('endPlace', 'pA', 'fA', {}, handlerA)
    api.hook('endPlace', 'pB', 'fB', {}, handlerB)
    api.hook('endPlace', 'pC', 'fC', { afterPlugin: 'pB' }, handlerC)
    await api.executeHook('endPlace', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when beforeFunction target is at start', async () => {
    api.hook('startPlaceFunc', 'pB', 'fB', {}, handlerB)
    api.hook('startPlaceFunc', 'pC', 'fC', {}, handlerC)
    api.hook('startPlaceFunc', 'pA', 'fA', { beforeFunction: 'fB' }, handlerA)
    await api.executeHook('startPlaceFunc', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when afterFunction target is at end', async () => {
    api.hook('endPlaceFunc', 'pA', 'fA', {}, handlerA)
    api.hook('endPlaceFunc', 'pB', 'fB', {}, handlerB)
    api.hook('endPlaceFunc', 'pC', 'fC', { afterFunction: 'fB' }, handlerC)
    await api.executeHook('endPlaceFunc', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should prioritize later placement calls if targets overlap and conflict (no explicit cycle detection)', async () => {
    api.hook('conflict', 'p1', 'f1', {}, createLoggedHookHandler('A'))
    api.hook('conflict', 'p2', 'f2', {}, createLoggedHookHandler('B'))

    api.hook('conflict', 'p3', 'f3', { beforeFunction: 'f2' }, createLoggedHookHandler('C'))
    api.hook('conflict', 'p4', 'f4', { afterFunction: 'f2' }, createLoggedHookHandler('D'))
    api.hook('conflict', 'p5', 'f5', { afterFunction: 'f1' }, createLoggedHookHandler('E'))

    await api.executeHook('conflict', {})
    expect(logs).toEqual(['A', 'E', 'C', 'B', 'D'])
  })

  test('should handle hooks with same functionName from different plugins', async () => {
    api.hook('duplicateFuncNames', 'pluginA', 'commonFunc', {}, createLoggedHookHandler('A_COMMON'))
    api.hook('duplicateFuncNames', 'pluginB', 'commonFunc', {}, createLoggedHookHandler('B_COMMON'))
    api.hook('duplicateFuncNames', 'pluginC', 'funcC', { beforeFunction: 'commonFunc' }, createLoggedHookHandler('C_BEFORE_COMMON'))
    await api.executeHook('duplicateFuncNames', {})
    expect(logs).toEqual(['C_BEFORE_COMMON', 'A_COMMON', 'B_COMMON'])
  })

  test('should handle placement referring to its own plugin but different function (internal consistency)', async () => {
    api.hook('selfRef', 'pluginA', 'funcA1', {}, createLoggedHookHandler('A1'))
    api.hook('selfRef', 'pluginA', 'funcA3', {}, createLoggedHookHandler('A3'))
    api.hook('selfRef', 'pluginA', 'funcA2', { afterFunction: 'funcA1' }, createLoggedHookHandler('A2'))
    await api.executeHook('selfRef', {})
    expect(logs).toEqual(['A1', 'A2', 'A3'])
  })
})

// --- NEW TEST SUITES FOR RESOURCE AND GLOBAL ACCESS ---

describe('Api.prototype.addResource() Functionality', () => {
  let api1, api2
  beforeEach(() => {
    resetGlobalRegistryForTesting()
    clearExecutionLog()
    api1 = new Api({ name: 'CRM_API', version: '1.0.0' })
    api2 = new Api({ name: 'ERP_API', version: '1.0.0' })
  })

  test('should successfully add a resource with options', () => {
    const resourceOptions = { schema: { id: 'string' }, settings: { auth: true } }
    api1.addResource('users', resourceOptions)
    expect(api1._resources.has('users')).toBeTruthy()
    expect(api1._resources.get('users').options).toEqual(resourceOptions)
  })

  test('should throw error if resource name is invalid', async () => {
    await expect(async () => api1.addResource('', {})).toThrow('Resource name must be a non-empty string.')
    await expect(async () => api1.addResource(null, {})).toThrow('Resource name must be a non-empty string.')
  })

  test('should throw error if resource name already exists on this API instance', async () => {
    api1.addResource('products', {})
    await expect(async () => api1.addResource('products', {})).toThrow('Resource \'products\' already exists on API \'CRM_API\'.')
  })

  test('should throw error if resource name is already used by another API instance globally', async () => {
    api1.addResource('globalResource', {}) // Added to CRM_API
    await expect(async () => api2.addResource('globalResource', {})).toThrow("Resource name 'globalResource' is already used by API 'CRM_API' version '1.0.0'. Resource names must be globally unique.")
  })

  test('should correctly register resource-specific hooks', async () => {
    let hookExecuted = false
    api1.addResource('orders', {}, {
      'beforeCreate': async (context) => {
        hookExecuted = true
        context.resourceHookRan = true
        expect(context.resourceName).toBe('orders') // Verify context has resourceName
      }
    })

    api1.implement('create', async (context) => {
      // Simulate an internal call that would trigger 'beforeCreate'
      await api1.executeHook('beforeCreate', context)
      return { status: 'created' }
    })

    // To trigger the hook, we must call an implemented method
    const result = await api1.instanceResources.orders.create({ data: 'order data' })
    expect(hookExecuted).toBeTruthy()
    expect(result.status).toBe('created')
  })

  test('resource-specific hook should only run if context.resourceName matches', async () => {
    let orderHookRan = false
    let productHookRan = false

    api1.addResource('orders', {}, {
      'beforeProcess': async (context) => {
        orderHookRan = true
        expect(context.resourceName).toBe('orders')
      }
    })
    api1.addResource('products', {}, {
      'beforeProcess': async (context) => {
        productHookRan = true
        expect(context.resourceName).toBe('products')
      }
    })

    api1.implement('process', async (context) => {
      // Execute the general 'beforeProcess' hook, which should then filter internally
      await api1.executeHook('beforeProcess', context)
      return { status: 'processed for ' + context.resourceName }
    })

    await api1.instanceResources.orders.process({ id: 123 })
    expect(orderHookRan).toBeTruthy()
    expect(productHookRan).toBeFalsy() // Product hook should NOT run for order operation

    clearExecutionLog() // Reset logs for next part
    orderHookRan = false
    productHookRan = false

    await api1.instanceResources.products.process({ id: 456 })
    expect(orderHookRan).toBeFalsy() // Order hook should NOT run for product operation
    expect(productHookRan).toBeTruthy()
  })

  test('resource-specific hook should pass original context and allow mutation', async () => {
    api1.addResource('items', {}, {
      'beforeSave': async (context) => {
        context.transformed = true
        context.data.value = context.data.value * 2
      }
    })
    api1.implement('save', async (context) => {
      // simulate the implementation calling the hook
      await api1.executeHook('beforeSave', context)
      return context.data.value
    })
    const context = { data: { value: 10 } }
    const result = await api1.instanceResources.items.save(context) // Call via proxy
    expect(context.transformed).toBeTruthy()
    expect(context.data.value).toBe(20)
    expect(result).toBe(20)
  })

  test('resource-specific hooks can have placement parameters (within same hook name)', async () => {
    let orderLog = [];

    // Define multiple handlers for a SINGLE hook name, but scoped to resources
    // The `functionName` is used for ordering within `Api.hook`
    api1.addResource('gadgets', {}, {
      'processGadgetHook': { // Use a common hook name that will hold multiple handlers
        functionName: 'gadget-pre-process', // Unique name for ordering
        handler: async (context) => {
          if (context.resourceName === 'gadgets') orderLog.push('GADGET_PRE');
        }
      }
    });

    // Add another handler for the *same* hook name 'processGadgetHook' directly using api.hook
    api1.hook('processGadgetHook', 'gadgets-plugin', 'gadget-post-process', { afterFunction: 'gadget-pre-process' }, async (context) => {
      if (context.resourceName === 'gadgets') orderLog.push('GADGET_POST');
    });

    api1.implement('triggerProcessGadgetHook', async (context) => {
      // Execute the common hook name. Both handlers are registered under this hook name.
      await api1.executeHook('processGadgetHook', context);
      return 'processed';
    });

    // Test with the 'gadgets' resource. Both handlers (pre and post) for 'processGadgetHook' should run in order.
    await api1.instanceResources.gadgets.triggerProcessGadgetHook({ resourceName: 'gadgets' });
    expect(orderLog).toEqual(['GADGET_PRE', 'GADGET_POST']);

    // Test with a different resource (or no resourceName in context) to ensure filtering works
    orderLog = []; // Reset
    api1.addResource('widgets', {}, {}); // Add another resource
    await api1.instanceResources.widgets.triggerProcessGadgetHook({ resourceName: 'widgets' }); // Call on different resource
    expect(orderLog).toEqual([]); // No gadget hooks should run
  });

  test('constructor hooks (API-wide) should run for resource operations', async () => {
    let apiWideHookRan = false;
    const apiWithGlobalHook = new Api({
      name: 'GlobalHookAPI',
      version: '1.0.0',
      hooks: {
        'beforeAnyOperation': async (context) => {
          apiWideHookRan = true;
          context.apiWideHookRan = true;
          executionLog.push('GLOBAL_HOOK');
        }
      }
    });

    apiWithGlobalHook.addResource('customers', {}, {
      'beforeCreate': async (context) => {
        expect(context.apiWideHookRan).toBeTruthy(); // Check if global hook already affected context
        executionLog.push('RESOURCE_HOOK');
      }
    })

    apiWithGlobalHook.implement('create', async (context) => {
      // For testing, manually trigger the hooks. In a real scenario, plugins would orchestrate this.
      await apiWithGlobalHook.executeHook('beforeAnyOperation', context);
      await apiWithGlobalHook.executeHook('beforeCreate', context);
      return { id: 'customer1' };
    });

    // When we call `create` on the 'customers' resource via proxy
    // The proxy automatically passes { resourceName: 'customers' } into the context.
    const result = await apiWithGlobalHook.instanceResources.customers.create({ name: 'New Customer' });

    expect(apiWideHookRan).toBeTruthy();
    expect(executionLog).toEqual(['GLOBAL_HOOK', 'RESOURCE_HOOK']);
    expect(result.id).toBe('customer1');
  });

  test('resource-specific hook should NOT run for general API-wide method call (without resource context)', async () => {
    let resourceHookRan = false;
    const apiWithResourceHook = new Api({ name: 'ResourceHookTestAPI', version: '1.0.0' });

    apiWithResourceHook.addResource('users', {}, {
      'beforeAction': async (context) => {
        resourceHookRan = true; // This should NOT be set if context.resourceName is not 'users'
      }
    });

    apiWithResourceHook.implement('doGlobalAction', async (context) => {
      // This general API method does not have a specific resourceName in its initial context
      // When executeHook is called, context.resourceName might be undefined or different
      await apiWithResourceHook.executeHook('beforeAction', context); // Intentionally call hook that has a resource-scoped handler
      return 'global success';
    });

    const result = await apiWithResourceHook.execute('doGlobalAction', { id: 'global' });
    expect(resourceHookRan).toBeFalsy(); // Confirm resource hook did NOT run
    expect(result).toBe('global success');
  });
})


describe('Api.resources Static Proxy (Global Access) - Setup & Context Fixes', () => {
  let crmApiV1, crmApiV2, erpApiV1, erpApiV2

  beforeEach(() => {
    resetGlobalRegistryForTesting()
    // CRITICAL: Ensure resource names are globally unique per API instance that owns them.
    // This setup now respects the global uniqueness constraint of addResource.

    crmApiV1 = new Api({ name: 'CRM_Suite', version: '1.0.0' })
    crmApiV1.addResource('crmUsersV1', { version: 'v1' }) // Unique name for V1's users
    crmApiV1.addResource('leads', { version: 'v1' }) // Unique
    crmApiV1.implement('create', async (ctx) => `CRM_V1: Created ${ctx.resourceName} with ${ctx.data.name}`)
    crmApiV1.implement('fetch', async (ctx) => `CRM_V1: Fetched ${ctx.resourceName} with ${ctx.data.id}`)

    crmApiV2 = new Api({ name: 'CRM_Suite', version: '2.0.0' })
    crmApiV2.addResource('crmUsers', { version: 'v2' }) // 'crmUsers' (latest) is owned by V2
    crmApiV2.addResource('deals', { version: 'v2' }) // New resource in V2
    crmApiV2.implement('create', async (ctx) => `CRM_V2: Created ${ctx.resourceName} with ${ctx.data.name}`)
    crmApiV2.implement('closeDeal', async (ctx) => `CRM_V2: Closed deal for ${ctx.data.amount}`)

    erpApiV1 = new Api({ name: 'ERP_System', version: '1.0.0' })
    erpApiV1.addResource('erpProductsV1', { version: 'v1' }) // Unique name for ERP_V1's products
    erpApiV1.implement('fetch', async (ctx) => `ERP_V1: Fetched ${ctx.resourceName} by ${ctx.data.id}`)

    erpApiV2 = new Api({ name: 'ERP_System', version: '2.0.0' })
    erpApiV2.addResource('erpProducts', { version: 'v2' }) // 'erpProducts' (latest) is owned by ERP_V2
    erpApiV2.addResource('orders', { version: 'v2' }) // Unique
    erpApiV2.implement('fetch', async (ctx) => `ERP_V2: Fetched ${ctx.resourceName} by ${ctx.data.id}`)
    erpApiV2.implement('placeOrder', async (ctx) => `ERP_V2: Placed order for ${ctx.data.item}`)
  })

  test('should access resource on the latest API version by default', async () => {
    // 'crmUsers' is uniquely defined by CRM_Suite V2, so it should resolve to V2.
    const result = await Api.resources.crmUsers.create({ data: { name: 'Jane' } })
    expect(result).toBe('CRM_V2: Created crmUsers with Jane')
  })

  test('should access resource with specific API version range', async () => {
    // 'crmUsersV1' is uniquely defined by CRM_Suite V1.
    const result = await Api.resources.version('^1.0.0').crmUsersV1.create({ data: { name: 'John' } })
    expect(result).toBe('CRM_V1: Created crmUsersV1 with John')
  })

  test('should return undefined for non-existent resource', () => {
    const nonExistent = Api.resources.nonExistentResource
    expect(nonExistent).toBeUndefined() // Should return undefined, and log warning
  })

  test('should return undefined for non-existent method on existing resource', () => {
    // 'crmUsers' exists, but 'deleteSomething' is not an implemented method anywhere.
    const nonExistentMethod = Api.resources.crmUsers.deleteSomething
    expect(nonExistentMethod).toBeUndefined()
  })

  test('should allow calling methods on different resources', async () => {
    // Call crmUsers on CRM_Suite (latest=V2)
    const userResult = await Api.resources.crmUsers.create({ data: { name: 'Bob' } })
    // Call erpProducts on ERP_System (latest=V2)
    const productResult = await Api.resources.erpProducts.fetch({ data: { id: 'P1' } })
    expect(userResult).toBe('CRM_V2: Created crmUsers with Bob')
    expect(productResult).toBe('ERP_V2: Fetched erpProducts by P1')
  })

  test('should find correct API and method when resource is shared across API versions (via specific naming)', async () => {
    // This test now demonstrates how to specifically target a resource on a particular API version,
    // given that resource names are globally unique.
    const userResultV1 = await Api.resources.crmUsersV1.create({ data: { name: 'Alice' } })
    expect(userResultV1).toBe('CRM_V1: Created crmUsersV1 with Alice')
    
    const userResultV2 = await Api.resources.crmUsers.create({ data: { name: 'Charlie' } }) // defaults to latest, which is CRM_V2
    expect(userResultV2).toBe('CRM_V2: Created crmUsers with Charlie')
  })

  test('should find new resource added in later API version', async () => {
    const orderResult = await Api.resources.orders.placeOrder({ data: { item: 'Laptop' } })
    expect(orderResult).toBe('ERP_V2: Placed order for Laptop') // Only ERP_V2 has 'orders' resource
  })

  test('should return undefined for a resource not present in any API matching version range', async () => {
    // 'leads' is only on CRM_Suite V1. Asking for 'leads' from ERP_System V2 range should yield undefined.
    const result = Api.resources.version('^2.0.0').leads
    expect(result).toBeUndefined()
  })
})


describe('Api.instanceResources Instance Proxy (Local Access) - Context Fixes', () => {
  let api
  beforeEach(() => {
    resetGlobalRegistryForTesting()
    api = new Api({ name: 'Local_Test_API', version: '1.0.0' })
    api.addResource('users', { schema: 'UserSchema' })
    api.addResource('posts', { schema: 'PostSchema' })
    api.implement('createRecord', async (ctx) => `Created ${ctx.resourceName}: ${ctx.data.value}`)
    api.implement('getRecord', async (ctx) => `Got ${ctx.resourceName}: ${ctx.data.id}`)
  })

  test('should access resource options via instanceResources proxy (indirectly through context)', async () => {
    api.addResource('settings', { theme: 'dark' }, {
      'onInit': async (context) => {
        expect(context.apiInstance._resources.get(context.resourceName).options.theme).toBe('dark');
      }
    });

    api.implement('initialize', async (context) => {
      // Simulate calling a hook that processes settings.
      await api.executeHook('onInit', { ...context, resourceName: 'settings' });
      return 'initialized';
    });

    // Call the implementation via the resource proxy.
    const result = await api.instanceResources.settings.initialize({});
    expect(result).toBe('initialized');
  });

  test('should access existing resource and call implemented method', async () => {
    const result = await api.instanceResources.users.createRecord({ data: { value: 'Alice' } }) // Pass data in 'data' field
    expect(result).toBe('Created users: Alice')
  })

  test('should access different existing resource and call implemented method', async () => {
    const result = await api.instanceResources.posts.getRecord({ data: { id: 123 } }) // Pass data in 'data' field
    expect(result).toBe('Got posts: 123')
  })

  test('should return undefined for non-existent resource on this API instance', () => {
    const nonExistent = api.instanceResources.nonExistent
    expect(nonExistent).toBeUndefined()
  })

  test('should return undefined for non-existent method on existing resource locally', () => {
    const nonExistentMethod = api.instanceResources.users.updateRecord
    expect(nonExistentMethod).toBeUndefined()
  })

  test('an implemented method can use instanceResources to call another resource method on the same API instance', async () => {
    api.implement('processOrder', async (ctx) => {
      const userCreateResult = await ctx.apiInstance.instanceResources.users.createRecord({ data: { value: 'OrderUser' } });
      const postGetResult = await ctx.apiInstance.instanceResources.posts.getRecord({ data: { id: 'latest' } });
      return `Order processed. User: ${userCreateResult}, Post: ${postGetResult}`;
    });

    // Call 'processOrder' on 'users' resource. This will pass resourceName 'users' to processOrder.
    const result = await api.instanceResources.users.processOrder({ orderId: 'ABC' });
    expect(result).toBe('Order processed. User: Created users: OrderUser, Post: Got posts: latest');
  })

  test('instanceResources methods should correctly pass resourceName to implemented methods', async () => {
    let receivedResourceName = '';
    api.implement('log', async (ctx) => {
      receivedResourceName = ctx.resourceName;
      return 'logged';
    });

    await api.instanceResources.users.log({ message: 'User action' });
    expect(receivedResourceName).toBe('users');

    clearExecutionLog(); // Clear for the next call
    await api.instanceResources.posts.log({ message: 'Post viewed' });
    expect(receivedResourceName).toBe('posts');
  });
})

describe('Combined Hook, Implementation, and Resource Interactions - Context & Order Fixes', () => {
  let api
  let executionOrder = [];

  const apiWideBeforeHook = async (context) => {
    // context.resourceName will be present if the operation originated from a resource proxy
    executionOrder.push(`API_BEFORE_${context.resourceName || 'GENERAL'}`);
    context.apiWideRan = true;
  };

  const resourceSpecificBeforeHook = async (context) => {
    if (context.resourceName === 'items') { // This check is vital for resource scoping
      executionOrder.push('ITEMS_BEFORE_RESOURCE');
      context.resourceSpecificRan = true;
    }
  };

  const itemCreateImplementation = async (context) => {
    executionOrder.push('ITEMS_CREATE_IMPL');
    await context.apiInstance.executeHook('afterCreate', context); // This hook call will trigger API-wide and resource-specific hooks.
    return `Item created: ${context.data.name}`;
  };

  const apiWideAfterHook = async (context) => {
    executionOrder.push(`API_AFTER_${context.resourceName || 'GENERAL'}`);
    expect(context.apiWideRan).toBeTruthy();
    if (context.resourceName === 'items') {
        expect(context.resourceSpecificRan).toBeTruthy();
    }
  };

  beforeEach(async () => {
    resetGlobalRegistryForTesting();
    executionOrder = []; // Reset for each test in this suite
    api = new Api({
      name: 'Full_Stack_API',
      version: '1.0.0',
      hooks: {
        'beforeOperation': apiWideBeforeHook,
        'afterOperation': apiWideAfterHook,
      }
    });

    api.addResource('items', { schema: 'ItemSchema' }, {
      'beforeOperation': resourceSpecificBeforeHook // Resource-scoped handler for 'beforeOperation'
    });

    api.implement('createItem', itemCreateImplementation);

    api.hook('afterCreate', 'internal', 'itemCreatedHook', {}, async (context) => {
      executionOrder.push(`AFTER_CREATE_DUMMY_HOOK_FOR_${context.resourceName}`);
    });
  });

  test('should execute API-wide hooks and resource-specific hooks in correct order for a resource operation', async () => {
    api.implement('orchestrateItemCreation', async (context) => {
      const operationContext = { ...context, resourceName: 'items' }; // Context for the specific operation

      // 1. Trigger general 'beforeOperation' hooks.
      // Both API-wide (apiWideBeforeHook) and resource-scoped (resourceSpecificBeforeHook) handlers are in this list.
      // The resource-scoped handler will *only* run if context.resourceName is 'items'.
      await api.executeHook('beforeOperation', operationContext);

      // 2. Execute the actual implementation logic
      const result = await api.execute('createItem', operationContext);

      // 3. Trigger general 'afterOperation' hooks.
      await api.executeHook('afterOperation', operationContext);

      return result;
    });

    // Call orchestrateItemCreation via the 'items' resource proxy
    const result = await api.instanceResources.items.orchestrateItemCreation({ data: { name: 'Widget' } });

    expect(executionOrder).toEqual([
      'API_BEFORE_items',        // API-wide before hook runs first, and correctly sees resourceName 'items'
      'ITEMS_BEFORE_RESOURCE', // Resource-specific before hook runs next, and requires resourceName 'items'
      'ITEMS_CREATE_IMPL',     // Actual implementation
      'AFTER_CREATE_DUMMY_HOOK_FOR_items', // Hook called from inside implementation
      'API_AFTER_items'          // API-wide after hook runs last, also sees resourceName 'items'
    ]);
    expect(result).toBe('Item created: Widget');
  });

  test('context should correctly propagate and be mutable across API-wide and resource-specific hooks', async () => {
    executionOrder = [];
    api = new Api({
      name: 'Context_Propagation_API',
      version: '1.0.0',
      hooks: {
        'validateAndProcess': async (context) => {
          executionOrder.push('API_VALIDATE');
          context.apiVersionChecked = context.apiInstance.options.version;
          if (!context.data.isValid) {
            context.error = 'Invalid data';
            return false;
          }
        },
        'afterProcessing': async (context) => {
          executionOrder.push('API_AFTER_PROCESS');
          context.finalStatus = 'processed by API';
        }
      }
    });

    api.addResource('widgets', { schema: 'WidgetSchema' }, {
      'validateAndProcess': async (context) => {
        if (context.resourceName === 'widgets') {
          executionOrder.push('WIDGET_PROCESS');
          context.processedByResource = true;
          context.data.processedValue = context.data.originalValue + '-transformed';
        }
      }
    });

    api.implement('handleWidget', async (context) => {
      // Ensure resourceName for resource-scoped hooks is set on the original context
      context.resourceName = 'widgets'; 
      
      await api.executeHook('validateAndProcess', context); // This triggers both hooks
      
      if (context.error) {
        return { status: 'failed', message: context.error };
      }

      executionOrder.push('HANDLE_WIDGET_IMPL');
      const finalResult = `Result: ${context.data.processedValue}`;

      await api.executeHook('afterProcessing', context);
      return { status: 'success', data: finalResult, finalStatus: context.finalStatus };
    });

    // Test Case 1: Valid data for 'widgets' resource
    let testContext1 = { data: { isValid: true, originalValue: 'abc' } };
    let result1 = await api.instanceResources.widgets.handleWidget(testContext1);

    expect(executionOrder).toEqual(['API_VALIDATE', 'WIDGET_PROCESS', 'HANDLE_WIDGET_IMPL', 'API_AFTER_PROCESS']);
    expect(result1.status).toBe('success');
    expect(result1.data).toBe('Result: abc-transformed');
    expect(testContext1.apiVersionChecked).toBe('1.0.0');
    expect(testContext1.processedByResource).toBe(true);
    expect(testContext1.finalStatus).toBe('processed by API');

    // Test Case 2: Invalid data for 'widgets' resource (should stop early)
    clearExecutionLog();
    let testContext2 = { data: { isValid: false, originalValue: 'xyz' } };
    let result2 = await api.instanceResources.widgets.handleWidget(testContext2);

    expect(executionOrder).toEqual(['API_VALIDATE']);
    expect(result2.status).toBe('failed');
    expect(result2.message).toBe('Invalid data');
    expect(testContext2.processedByResource).toBeFalsy();
    expect(testContext2.finalStatus).toBeUndefined();
  });

  test('plugin-provided implementations should correctly receive resourceName in context', async () => {
    const MyPlugin = {
      name: 'MyDataPlugin',
      install: (apiInstance) => {
        apiInstance.implement('fetchData', async (context) => {
          executionOrder.push(`PLUGIN_FETCH_DATA_IMPL_FOR_${context.resourceName}`);
          return `Fetched data for ${context.resourceName}: ${context.query}`;
        });
      }
    };
    await api.use(MyPlugin);

    api.addResource('reports', {}, {});
    api.addResource('metrics', {}, {});

    const reportResult = await api.instanceResources.reports.fetchData({ query: 'monthly' });
    expect(reportResult).toBe('Fetched data for reports: monthly');
    expect(executionOrder).toEqual(['PLUGIN_FETCH_DATA_IMPL_FOR_reports']);

    clearExecutionLog(); // Clear for the next assertion within the same test
    const metricResult = await api.instanceResources.metrics.fetchData({ query: 'daily' });
    expect(metricResult).toBe('Fetched data for metrics: daily');
    expect(executionOrder).toEqual(['PLUGIN_FETCH_DATA_IMPL_FOR_metrics']);
  });

  
  


})


describe('Combined Constants and Implementers Feature', () => {

  // This beforeEach sets up a single, complex API instance designed to test
  // every level of the property lookup hierarchy.
  beforeEach(() => {
    resetGlobalRegistryForTesting();
    clearExecutionLog();
  });

  describe('Constructor-level Initialization', () => {
    it('should correctly register implementers from the constructor', async () => {
      const api = new Api({
        name: 'constructor-api',
        version: '1.0.0',
        implementers: {
          constructorMethod: async (ctx) => `Hello from constructor method on ${ctx.resourceName}`
        }
      });
      api.addResource('users');
      const result = await api.instanceResources.users.constructorMethod();
      expect(result).toBe('Hello from constructor method on users');
    });

    it('should correctly register constants from the constructor', () => {
      const api = new Api({
        name: 'constructor-api',
        version: '1.0.0',
        constants: {
          API_KEY: 'abc-123'
        }
      });
      api.addResource('users');
      expect(api.instanceResources.users.API_KEY).toBe('abc-123');
    });

    it('should prioritize a constructor constant over a constructor implementer with the same name', () => {
      const api = new Api({
        name: 'constructor-priority',
        version: '1.0.0',
        constants: {
          priorityProp: 'CONSTANT_WINS'
        },
        implementers: {
          priorityProp: async () => 'IMPLEMENTER_LOSES'
        }
      });
      api.addResource('users');
      expect(api.instanceResources.users.priorityProp).toBe('CONSTANT_WINS');
    });
  });

  describe('Resource-level Initialization (addResource)', () => {
    it('should correctly register a resource-specific implementer', async () => {
        const api = new Api({ name: 'resource-level', version: '1.0.0' });
        api.addResource('products', {}, {}, { // 4th argument is for implementers
            generateSku: async (ctx) => `SKU-for-${ctx.data.id}`
        });
        const result = await api.instanceResources.products.generateSku({ data: { id: 42 } });
        expect(result).toBe('SKU-for-42');
    });

    it('should correctly register a resource-specific constant', () => {
        const api = new Api({ name: 'resource-level', version: '1.0.0' });
        api.addResource('products', {}, {}, {}, { // 5th argument is for constants
            MAX_STOCK: 1000
        });
        expect(api.instanceResources.products.MAX_STOCK).toBe(1000);
    });

    it('should throw an error if a resource implementer is not a function', async () => {
        const api = new Api({ name: 'resource-level', version: '1.0.0' });
        await expect(() => api.addResource('products', {}, {}, { badMethod: 'not-a-function' }))
            .toThrow("Implementer 'badMethod' for resource 'products' on API 'resource-level' must be a function.");
    });
  });

  describe('Full Lookup Priority Hierarchy', () => {
    let api;
    beforeEach(() => {
      // Setup a multi-layered API to test every priority level
      api = new Api({
        name: 'priority-test',
        version: '1.0.0',
        constants: {
          API_CONSTANT: 'api-level-constant',
          shadowProp: 'api-level-constant-shadow',
          apiOnlyConstant: 'api-only-constant-value'
        },
        implementers: {
          apiLevelMethod: async (ctx) => `api-level-method on ${ctx.resourceName}`,
          shadowProp: async () => 'api-level-implementer-shadow',
          apiOnlyMethod: async () => 'api-only-method-value'
        }
      });

      // Resource A: Has its own specific constants and implementers that shadow API-level ones
      api.addResource('resourceA', {}, {},
        { // Implementers (4th argument)
          resourceMethod: async () => 'resource-A-method',
          shadowProp: async () => 'resource-A-implementer' // Shadows API constant and implementer
        },
        { // Constants (5th argument)
          RESOURCE_A_CONSTANT: 'resource-A-constant',
          shadowProp: 'resource-A-constant' // Highest priority shadow
        }
      );

      // Resource B: Has no specific properties, should fall back to API-level
      api.addResource('resourceB');
    });

    it('Priority 1: Resource-specific constant should shadow all other levels', () => {
      expect(api.instanceResources.resourceA.shadowProp).toBe('resource-A-constant');
    });

    it('Priority 2: Resource-specific implementer should shadow API-level properties', async () => {
      api.addResource('resourceC', {}, {}, { // Implementers (4th argument)
          apiOnlyConstant: async () => 'resource-C-implementer-wins'
      });
      const result = await api.instanceResources.resourceC.apiOnlyConstant();
      expect(result).toBe('resource-C-implementer-wins');
    });

    it('Priority 3: API-level constant should shadow an API-level implementer', () => {
      expect(api.instanceResources.resourceB.shadowProp).toBe('api-level-constant-shadow');
    });

    it('Priority 4: API-level implementer should be the final fallback for methods', async () => {
      const result = await api.instanceResources.resourceB.apiLevelMethod();
      expect(result).toBe('api-level-method on resourceB');
    });

    it('should correctly access un-shadowed resource-specific properties', async () => {
        expect(api.instanceResources.resourceA.RESOURCE_A_CONSTANT).toBe('resource-A-constant');
        const result = await api.instanceResources.resourceA.resourceMethod();
        expect(result).toBe('resource-A-method');
    });

    it('should correctly access un-shadowed API-level properties from a resource proxy', async () => {
        expect(api.instanceResources.resourceA.apiOnlyConstant).toBe('api-only-constant-value');
        const result = await api.instanceResources.resourceA.apiOnlyMethod();
        expect(result).toBe('api-only-method-value');
    });
  });

  describe('Global Static Access (`Api.resources`) with Full Priority', () => {
    beforeEach(() => {
        resetGlobalRegistryForTesting();
        
        // V1 API: 'config' is a method
        const apiV1 = new Api({ name: 'global-access', version: '1.0.0' });
        apiV1.addResource('settings', {}, {}, { // Correct: 4th argument is for implementers
            config: async () => 'v1-method-config'
        });

        // V2 API: 'config' is a constant
        const apiV2 = new Api({ name: 'global-access', version: '2.0.0' });
        apiV2.addResource('settings', {}, {}, {}, { // Correct: 5th argument is for constants
            config: 'v2-constant-config'
        });
    });

    it('should get the highest priority property from the latest version by default', () => {
        const config = Api.resources.settings.config;
        expect(config).toBe('v2-constant-config');
    });

    it('should get the property from a specific version range, respecting its priority', async () => {
        const configProxy = Api.resources.version('^1.0.0').settings.config;
        expect(typeof configProxy).toBe('function');
        const result = await configProxy();
        expect(result).toBe('v1-method-config');
    });
  });

  describe('Dynamic `addConstant` and `implement` Interactions', () => {
    let api;
    beforeEach(() => {
        resetGlobalRegistryForTesting();
        api = new Api({ name: 'dynamic-api', version: '1.0.0' });
    });

    it('addConstant should shadow a pre-existing implementer', () => {
        api.implement('prop', async () => 'implementer');
        api.addConstant('prop', 'constant');
        api.addResource('test');
        expect(api.instanceResources.test.prop).toBe('constant');
    });

    it('implement should be shadowed by a pre-existing constant', () => {
        api.addConstant('prop', 'constant');
        api.implement('prop', async () => 'implementer');
        api.addResource('test');
        expect(api.instanceResources.test.prop).toBe('constant');
    });
  });
})
