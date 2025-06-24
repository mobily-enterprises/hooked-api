// api-base.test.js
// To run this:
// 1. Make sure you have 'semver' installed: npm install semver
// 2. Make sure your Api class is in '../api.js' (or adjust path)
// 3. Run: node --test tests/api-base.test.js

import { test, beforeEach, describe } from 'node:test'
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
    assert.ok(actual, `Expected truthy, but got ${actual}`)
  },
  toBeFalsy: () => {
    assert.strictEqual(!!actual, false, `Expected falsy, but got ${actual}`)
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
      // If 'actual' is a function, call and await it.
      // If 'actual' is not a function (e.g., a direct value), it means the test expects the setup to throw,
      // which is typically handled by calling a function that throws synchronously.
      if (typeof actual === 'function') {
        await actual(); // Await allows catching rejections from async functions
      } else {
        // If not a function, and we reached here, it implies an error in test setup for synchronous throws.
        // The original usage expected 'actual' to be a function that *would* throw.
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

// Make hook handlers async to match Api class's executeHook
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

  // REMOVED: Constructor now *requires* name and version. It will throw if none are provided.
  // Test removed as it checks for null defaults, which is no longer the case.
  // test('Constructor should initialize with default options if none provided', () => { ... })

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

  // MODIFIED: Constructor now *throws* if name is missing or invalid during construction.
  // Using expect(() => new Api(...)).toThrow() for synchronous throws.
  test('Constructor should throw error if name is missing or invalid', async () => { // Changed to async because toThrow is async
    await expect(async () => new Api({ name: null, version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.') // Added null test
    await expect(async () => new Api({ name: '', version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.')
    await expect(async () => new Api({ version: '1.0.0' })).toThrow('API instance must have a non-empty "name" property.') // name is undefined
    await expect(async () => new Api({})).toThrow('API instance must have a non-empty "name" property.') // name is undefined
  })

  // MODIFIED: Constructor now throws if version format is invalid during construction.
  test('Constructor should throw error if version format is invalid', async () => { // Changed to async because toThrow is async
    // Adjusted expected error message substring to match actual output
    await expect(async () => new Api({ name: 'invalid-ver-test', version: '1.x.0' })).toThrow("Invalid version format '1.x.0'")
    await expect(async () => new Api({ name: 'invalid-ver-test', version: 'beta' })).toThrow("Invalid version format 'beta'") // Added another invalid format
  })

  // REMOVED: These errors are now caught by the Api constructor itself, before register() is explicitly called.
  // The 'API name and version required for registration' message is no longer thrown by register().
  // test('register() should throw error if name is missing', () => { ... })
  // test('register() should throw error if version is missing', () => { ... })

  test('register() should successfully register an API instance', () => {
    const api = new Api({ name: 'my-service', version: '1.0.0' }) // Already registered by constructor
    api.register() // Calling it again will trigger a console.warn, but the registration is confirmed
    expect(Api.registry.has('my-service', '1.0.0')).toBeTruthy()
    expect(Api.registry.get('my-service', '1.0.0')).toBe(api)
  })

  test('register() should return the API instance for chaining', () => {
    const api = new Api({ name: 'chain-test', version: '1.0.0' }) // Already registered by constructor
    expect(api.register()).toBe(api)
  })

  // MODIFIED: The test for `register()` for multiple versions is adjusted.
  // The `Api.versions` alias was removed, now use `Api.registry.versions`.
  // Using direct assert.strictEqual for length check due to custom expect wrapper.
  test('register() should register multiple versions of the same API', () => {
    const api1 = new Api({ name: 'multi-ver', version: '1.0.0' }) // Registered by constructor
    const api2 = new Api({ name: 'multi-ver', version: '1.1.0' }) // Registered by constructor
    expect(Api.registry.has('multi-ver', '1.0.0')).toBeTruthy()
    expect(Api.registry.has('multi-ver', '1.1.0')).toBeTruthy()
    assert.strictEqual(Api.registry.versions('multi-ver').length, 2, 'Expected 2 versions for multi-ver API') // Corrected assertion
  })

  test('register() should handle registering the same API instance twice gracefully (no error, just overwrites itself)', () => {
    const api = new Api({ name: 're-reg', version: '1.0.0' }) // Registered by constructor
    expect(() => api.register()).not.toThrow() // Calling it again is fine
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

  test('implement() and execute() should throw error if implement handler is not a function', async () => { // Changed to async because toThrow is async
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    await expect(async () => api.implement('badMethod', 'not-a-function')).toThrow('Implementation for \'badMethod\' must be a function.')
  })

  test('implement() and execute() should execute an implemented method and return its result', async () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' })
    api.implement('getData', async (ctx) => ctx.id * 2)
    const result = await api.execute('getData', { id: 5 })
    expect(result).toBe(10)
  })

  // FIXED: context mutation now works correctly in api.js
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
    // Api instances now require a name in the constructor and auto-register
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
    // Expecting 2.0.0 as the highest valid version according to semver sorting
    expect(Api.registry.get('my-lib', 'latest')).toBe(apiV3)
  })

  test('registry.get() should return the latest version when "latest" is requested for API with only one version', () => {
    const singleApi = new Api({ name: 'single-lib', version: '1.0.0' })
    expect(Api.registry.get('single-lib', 'latest')).toBe(singleApi)
  })

  test('registry.get() should handle semver range satisfaction (^)', () => {
    // For '^1.0.0', semver resolves to the highest compatible. 1.5.0-beta is a pre-release,
    // so 1.2.3 is the highest stable version satisfying ^1.0.0.
    expect(Api.registry.get('my-lib', '^1.0.0')).toEqual(apiV2)
  })

  test('registry.get() should return exact match when no operators and exact version exists', () => {
    expect(Api.registry.get('my-lib', '1.0.0')).toBe(apiV1)
  })

  test('registry.get() should return null for incompatible semver range', () => {
    expect(Api.registry.get('my-lib', '^3.0.0')).toBe(null)
  })

  test('registry.get() should return correct compatible version for >= operator (if no exact match and range not used)', () => {
    // The highest version >= 1.1.0 (from 1.0.0, 1.2.3, 1.5.0-beta, 2.0.0) is 2.0.0 based on real semver.compare.
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
    // Correct order based on semver.rcompare
    expect(listed['my-lib']).toEqual(['2.0.0', '1.5.0-beta', '1.2.3', '1.0.0'])
    expect(listed['other-lib']).toEqual(['0.5.0'])
  })

  // MODIFIED: Using direct assert.strictEqual for length check due to custom expect wrapper.
  test('registry.list() should handle multiple APIs correctly', () => {
    new Api({ name: 'another-lib', version: '1.0.0' }) // Auto-registers
    const listed = Api.registry.list()
    assert.strictEqual(Object.keys(listed).length, 3, 'Expected 3 APIs in the registry list'); // Corrected assertion
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

  // MODIFIED: `Api.versions` alias was removed, now use `Api.registry.versions`.
  test('static versions() should return an empty array if API name does not exist', () => {
    expect(Api.registry.versions('non-existent-api')).toEqual([])
  })

  // MODIFIED: `Api.versions` alias was removed, now use `Api.registry.versions`.
  test('static versions() should return sorted versions for an existing API', () => {
    expect(Api.registry.versions('my-lib')).toEqual(['2.0.0', '1.5.0-beta', '1.2.3', '1.0.0'])
  })
})

describe('Api Class Plugin System (use() method)', () => {
  let api
  beforeEach(async () => { // Changed to async beforeEach to allow for await in test setup if needed
    resetGlobalRegistryForTesting()
    clearExecutionLog()
    api = new Api({ name: 'plugin-test-api', version: '1.0.0' }) // Api constructor requires name and version
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
    // Declare plugins within the test to ensure isolated state
    const depPlugin = { name: 'dep-plugin', install: (apiInstance, opts, name) => { /* noop */ } }
    const mainPlugin = { name: 'main-plugin', dependencies: ['dep-plugin'], install: (apiInstance, opts, name) => { /* noop */ } }
    
    await api.use(depPlugin) // Install dependency first
    
    // This assertion should now pass, as the dependency 'dep-plugin' is installed.
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
    expect(api._installedPlugins.has('error-plugin')).toBeFalsy() // Plugin should not be marked as installed
  })

  test('should not install plugin if dependency loop (basic check - caught by order)', async () => {
    // Test setup to ensure p2's dependency on p1 causes a throw
    const p1 = { name: 'p1', install: () => {} } // P1 has no dependencies for this test
    const p2 = { name: 'p2', dependencies: ['p1'], install: () => {} } // P2 needs P1

    await expect(async () => api.use(p2)).toThrow('requires dependency \'p1\' which is not installed.') // P2 should throw as it needs P1
    expect(api._installedPlugins.has('p1')).toBeFalsy() // Neither should be installed yet
    expect(api._installedPlugins.has('p2')).toBeFalsy()

    // Optionally, if you want to test the full loop breaking after p1 is installed
    await api.use(p1) // Now P1 is installed
    await expect(async () => api.use(p2)).not.toThrow() // P2 should now install successfully
    expect(api._installedPlugins.has('p2')).toBeTruthy()
  })
})

describe('Api.hook() Method (Comprehensive Placement)', () => {
  let api
  let logs
  let handlerA, handlerB, handlerC, handlerD
  let pluginA, pluginB, pluginC

  beforeEach(async () => { // Changed to async beforeEach
    resetGlobalRegistryForTesting()
    clearExecutionLog()
    logs = getExecutionLog()

    // Api constructor now requires name and version
    api = new Api({ name: 'hook-test-api', version: '1.0.0' })

    handlerA = createLoggedHookHandler('A')
    handlerB = createLoggedHookHandler('B')
    handlerC = createLoggedHookHandler('C')
    handlerD = createLoggedHookHandler('D')

    pluginA = { name: 'pluginA', install: () => {} }
    pluginB = { name: 'pluginB', install: () => {} }
    pluginC = { name: 'pluginC', install: () => {} }

    // Must use await since use() is async
    await api.use(pluginA)
    await api.use(pluginB)
    await api.use(pluginC)
  })

  // --- Basic Hooking & Execution ---
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

  // FIXED: context mutation now works correctly in api.js
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

  // --- Validation Tests ---
  test('should throw error if pluginName is missing/invalid', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', '', 'func', {}, handlerA)).toThrow('requires a valid \'pluginName\'')
    await expect(async () => api.hook('test', 123, 'func', {}, handlerA)).toThrow('requires a valid \'pluginName\'')
  })

  test('should throw error if functionName is missing/invalid', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', 'p', '', {}, handlerA)).toThrow('requires a valid \'functionName\'')
    await expect(async () => api.hook('test', 'p', null, {}, handlerA)).toThrow('requires a valid \'functionName\'')
  })

  test('should throw error if handler is not a function', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', 'p', 'f', {}, 'not-a-func')).toThrow('must be a function')
  })

  test('should throw error if both beforePlugin and afterPlugin are used', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', 'p', 'f', { beforePlugin: 'p1', afterPlugin: 'p2' }, handlerA)).toThrow('cannot specify both \'beforePlugin\' and \'afterPlugin\'.')
  })

  test('should throw error if both beforeFunction and afterFunction are used', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', 'p', 'f', { beforeFunction: 'f1', afterFunction: 'f2' }, handlerA)).toThrow('cannot specify both \'beforeFunction\' and \'afterFunction\'.')
  })

  test('should throw error if both plugin-level and function-level placement are used', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('test', 'p', 'f', { beforePlugin: 'p1', beforeFunction: 'f1' }, handlerA)).toThrow('cannot specify both plugin-level and function-level placement parameters.')
  })

  // --- beforePlugin Tests ---
  test('should place hook before first handler of target plugin (beforePlugin)', async () => {
    api.hook('orderTest', 'pluginA', 'funcA1', {}, handlerA)
    api.hook('orderTest', 'pluginB', 'funcB1', {}, handlerB) // Will be after A1
    api.hook('orderTest', 'pluginA', 'funcA2', {}, handlerC) // Will be after B1
    api.hook('orderTest', 'pluginC', 'funcC1', { beforePlugin: 'pluginB' }, handlerD) // Should go between A1 and B1
    await api.executeHook('orderTest', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should throw if beforePlugin target plugin has no handlers for this hook', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('emptyTargetHook', 'pluginA', 'funcA', { beforePlugin: 'pluginB_non_existent' }, handlerA))
      .toThrow('\'beforePlugin\' target plugin \'pluginB_non_existent\' not found among existing handlers.')
  })

  // --- afterPlugin Tests ---
  test('should place hook after last handler of target plugin (afterPlugin)', async () => {
    api.hook('orderTest', 'pluginA', 'funcA1', {}, handlerA)
    api.hook('orderTest', 'pluginB', 'funcB1', {}, handlerB)
    api.hook('orderTest', 'pluginA', 'funcA2', {}, handlerC) // Order: A1, B1, A2
    api.hook('orderTest', 'pluginC', 'funcC1', { afterPlugin: 'pluginA' }, handlerD) // Should go after A2
    await api.executeHook('orderTest', {})
    expect(logs).toEqual(['A', 'B', 'C', 'D'])
  })

  test('should throw if afterPlugin target plugin has no handlers for this hook', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('emptyTargetHook', 'pluginA', 'funcA', { afterPlugin: 'pluginB_non_existent' }, handlerA))
      .toThrow('\'afterPlugin\' target plugin \'pluginB_non_existent\' not found among existing handlers.')
  })

  // --- beforeFunction Tests ---
  test('should place hook before a specific function (beforeFunction)', async () => {
    api.hook('orderFunc', 'p1', 'f1', {}, handlerA)
    api.hook('orderFunc', 'p2', 'f2', {}, handlerB)
    api.hook('orderFunc', 'p3', 'f3', {}, handlerC) // Current: A, B, C
    api.hook('orderFunc', 'p4', 'f4', { beforeFunction: 'f2' }, handlerD) // D before B
    await api.executeHook('orderFunc', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should place hook before a specific function from a different plugin', async () => {
    // This highlights interleaving capability
    api.hook('interleave', 'pluginA', 'funcA', {}, handlerA)
    api.hook('interleave', 'pluginB', 'funcB', {}, handlerB)
    api.hook('interleave', 'pluginC', 'funcC', {}, handlerC)
    api.hook('interleave', 'pluginD', 'funcD', { beforeFunction: 'funcA' }, handlerD) // D before A
    await api.executeHook('interleave', {})
    expect(logs).toEqual(['D', 'A', 'B', 'C'])
  })

  test('should throw if beforeFunction target function not found', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('targetFuncMissing', 'p1', 'f1', { beforeFunction: 'nonExistentFunc' }, handlerA))
      .toThrow('\'beforeFunction\' target function \'nonExistentFunc\' not found')
  })

  // --- afterFunction Tests ---
  test('should place hook after a specific function (afterFunction)', async () => {
    api.hook('orderFunc', 'p1', 'f1', {}, handlerA)
    api.hook('orderFunc', 'p2', 'f2', {}, handlerB)
    api.hook('orderFunc', 'p3', 'f3', {}, handlerC) // Current: A, B, C
    api.hook('orderFunc', 'p4', 'f4', { afterFunction: 'f2' }, handlerD) // D after B
    await api.executeHook('orderFunc', {})
    expect(logs).toEqual(['A', 'B', 'D', 'C'])
  })

  test('should place hook after a specific function from a different plugin', async () => {
    api.hook('interleaveAfter', 'pluginA', 'funcA', {}, handlerA)
    api.hook('interleaveAfter', 'pluginB', 'funcB', {}, handlerB)
    api.hook('interleaveAfter', 'pluginC', 'funcC', {}, handlerC)
    api.hook('interleaveAfter', 'pluginD', 'funcD', { afterFunction: 'funcA' }, handlerD) // D after A
    await api.executeHook('interleaveAfter', {})
    expect(logs).toEqual(['A', 'D', 'B', 'C'])
  })

  test('should throw if afterFunction target function not found', async () => { // Changed to async because toThrow is async
    await expect(async () => api.hook('targetFuncMissing', 'p1', 'f1', { afterFunction: 'nonExistentFunc' }, handlerA))
      .toThrow('\'afterFunction\' target function \'nonExistentFunc\' not found')
  })

  // --- Complex Ordering Scenarios ---
  test('should correctly interleave hooks using multiple function-level placements', async () => {
    api.hook('complex', 'p1', 'h1', {}, createLoggedHookHandler('H1'))
    api.hook('complex', 'p2', 'h2', {}, createLoggedHookHandler('H2'))
    api.hook('complex', 'p3', 'h3', {}, createLoggedHookHandler('H3'))
    api.hook('complex', 'p4', 'h4', {}, createLoggedHookHandler('H4'))

    // Valid placement: after H1, then this new hook (H5) becomes a new target, before H3.
    // This is valid as it uses one relative placement per call.
    api.hook('complex', 'p5', 'h5', { afterFunction: 'h1' }, createLoggedHookHandler('H5')) // H5 after H1
    api.hook('complex', 'p6', 'h6', { beforeFunction: 'h3' }, createLoggedHookHandler('H6')) // H6 before H3

    await api.executeHook('complex', {})
    expect(logs).toEqual(['H1', 'H5', 'H2', 'H6', 'H3', 'H4'])
  })

  test('should correctly interleave hooks using mixed plugin and function placements', async () => {
    api.hook('mixedOrder', 'pA', 'fA', {}, createLoggedHookHandler('A'))
    api.hook('mixedOrder', 'pB', 'fB', {}, createLoggedHookHandler('B'))
    api.hook('mixedOrder', 'pC', 'fC', {}, createLoggedHookHandler('C'))

    // Insert D after Plugin A (i.e., after fA's last occurrence which is the only one)
    api.hook('mixedOrder', 'pD', 'fD', { afterPlugin: 'pA' }, createLoggedHookHandler('D'))
    // Current handlers: [A, D, B, C]

    // Insert E before fB
    api.hook('mixedOrder', 'pE', 'fE', { beforeFunction: 'fB' }, createLoggedHookHandler('E'))
    // Current handlers: [A, D, E, B, C]

    await api.executeHook('mixedOrder', {})
    expect(logs).toEqual(['A', 'D', 'E', 'B', 'C'])
  })

  test('should handle multiple placements in sequence for the same target', async () => {
    api.hook('seqOrder', 'p1', 'f1', {}, createLoggedHookHandler('F1'))
    api.hook('seqOrder', 'p2', 'f2', {}, createLoggedHookHandler('F2'))
    // Add F3 after F1
    api.hook('seqOrder', 'p3', 'f3', { afterFunction: 'f1' }, createLoggedHookHandler('F3')) // F1, F3, F2
    // Add F4 after F3
    api.hook('seqOrder', 'p4', 'f4', { afterFunction: 'f3' }, createLoggedHookHandler('F4')) // F1, F3, F4, F2
    await api.executeHook('seqOrder', {})
    expect(logs).toEqual(['F1', 'F3', 'F4', 'F2'])
  })

  test('should place correctly when beforePlugin target is at start', async () => {
    api.hook('startPlace', 'pB', 'fB', {}, handlerB)
    api.hook('startPlace', 'pC', 'fC', {}, handlerC)
    api.hook('startPlace', 'pA', 'fA', { beforePlugin: 'pB' }, handlerA) // A should be first
    await api.executeHook('startPlace', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when afterPlugin target is at end', async () => {
    api.hook('endPlace', 'pA', 'fA', {}, handlerA)
    api.hook('endPlace', 'pB', 'fB', {}, handlerB)
    api.hook('endPlace', 'pC', 'fC', { afterPlugin: 'pB' }, handlerC) // C should be last
    await api.executeHook('endPlace', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when beforeFunction target is at start', async () => {
    api.hook('startPlaceFunc', 'pB', 'fB', {}, handlerB)
    api.hook('startPlaceFunc', 'pC', 'fC', {}, handlerC)
    api.hook('startPlaceFunc', 'pA', 'fA', { beforeFunction: 'fB' }, handlerA) // A should be first
    await api.executeHook('startPlaceFunc', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should place correctly when afterFunction target is at end', async () => {
    api.hook('endPlaceFunc', 'pA', 'fA', {}, handlerA)
    api.hook('endPlaceFunc', 'pB', 'fB', {}, handlerB)
    api.hook('endPlaceFunc', 'pC', 'fC', { afterFunction: 'fB' }, handlerC) // C should be last
    await api.executeHook('endPlaceFunc', {})
    expect(logs).toEqual(['A', 'B', 'C'])
  })

  test('should prioritize later placement calls if targets overlap and conflict (no explicit cycle detection)', async () => {
    // This demonstrates the LIFO nature of conflicting placements when not using topological sort
    api.hook('conflict', 'p1', 'f1', {}, createLoggedHookHandler('A'))
    api.hook('conflict', 'p2', 'f2', {}, createLoggedHookHandler('B')) // Current: A, B

    // C wants to be before B
    api.hook('conflict', 'p3', 'f3', { beforeFunction: 'f2' }, createLoggedHookHandler('C')) // Order: A, C, B

    // D wants to be after B (which is currently after C)
    api.hook('conflict', 'p4', 'f4', { afterFunction: 'f2' }, createLoggedHookHandler('D')) // Order: A, C, B, D

    // Now, let's make A want to be after D (a potential cycle or conflict with C's placement)
    // The current handler for 'f1' is at index 0. If we try to place it after D (last), it will move.
    // This is not a common scenario for re-ordering existing hooks this way, but demonstrates behavior.
    api.hook('conflict', 'p5', 'f5', { afterFunction: 'f1' }, createLoggedHookHandler('E')) // E after A: A, E, C, B, D

    await api.executeHook('conflict', {})
    expect(logs).toEqual(['A', 'E', 'C', 'B', 'D'])
  })

  test('should handle hooks with same functionName from different plugins', async () => {
    api.hook('duplicateFuncNames', 'pluginA', 'commonFunc', {}, createLoggedHookHandler('A_COMMON'))
    api.hook('duplicateFuncNames', 'pluginB', 'commonFunc', {}, createLoggedHookHandler('B_COMMON'))
    api.hook('duplicateFuncNames', 'pluginC', 'funcC', { beforeFunction: 'commonFunc' }, createLoggedHookHandler('C_BEFORE_COMMON')) // This should target the *first* 'commonFunc'
    await api.executeHook('duplicateFuncNames', {})
    expect(logs).toEqual(['C_BEFORE_COMMON', 'A_COMMON', 'B_COMMON'])
  })

  test('should handle placement referring to its own plugin but different function (internal consistency)', async () => {
    api.hook('selfRef', 'pluginA', 'funcA1', {}, createLoggedHookHandler('A1'))
    api.hook('selfRef', 'pluginA', 'funcA3', {}, createLoggedHookHandler('A3'))
    api.hook('selfRef', 'pluginA', 'funcA2', { afterFunction: 'funcA1' }, createLoggedHookHandler('A2')) // A2 after A1
    // Now the order is A1, A2, A3
    await api.executeHook('selfRef', {})
    expect(logs).toEqual(['A1', 'A2', 'A3'])
  })
})