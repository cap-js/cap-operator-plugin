# Change Log

All notable changes to this project will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org/). The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.0.3 - tbd

### Added

- Added CLI to generate runtime values file `npx cap-op-plugin generate-runtime-values`
- Updated `values.schema.json` to the latest version of CAP Operator(v0.6.0) and BTP Service Operator(v0.6.5)
- Default `$XSAPPNAME.Callback` & `$XSAPPNAME.mtcallback` scope (if not present) in `xs-security.json` on plugin call
- Switched chart to v2 apiVersion

## Version 0.0.2 - 13-May-2024

### Added

- Updated the readme file with more information on the runtime deployment parameters
- Tenant and content job default configuration added to workloads
- `tenantOperations` and `contentJobs` removed from the default configuration to avoid webhook errors during deployment

### Fixed

- Fixed placeholder render issue in mta transformer warning messages

## Version 0.0.1 - 23-April-2024

### Added

- Initial release
