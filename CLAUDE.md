# Claude Instructions for hooked-api

## Library Status
- This is a NEW library, not yet released
- Breaking changes are ACCEPTABLE and encouraged if they improve the design
- **NO BACKWARD COMPATIBILITY AT ALL, EVER** - focus on getting the API right

## Design Philosophy
- Clean separation between user data and framework data
- Resources should be easily accessible from implementers
- Avoid deeply nested property access (e.g., `options.apiInstance.instanceResources.users.list()` is too verbose)
- Options should contain configuration, not operational capabilities

## Current Design Considerations
- Handler signature needs rethinking to make resource access cleaner
- Consider single object parameter vs multiple parameters for handlers
- The goal is an intuitive, clean API that makes common operations easy