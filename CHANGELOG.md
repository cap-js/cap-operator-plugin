# Change Log

All notable changes to this project will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org/). The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.4.0 - 16-September-2024

### Added

- Added handling for `CAP` and `Additional` workloads in mta transformer

### Fixed

- Fix issue with CAV.Spec.Version being set as a number

## Version 0.3.0 - 13-September-2024

### Added

- New helm chart variant with configurable templates
- CLI tool to convert existing basic chart to configurable templates chart
- Updated @sap/cds-dk to version `8.2.1` for the CLI option parsing issue fix
- Support for dynamic service instance key name in `runtime-values.yaml` file
- Changed workload keys in the `values.yaml` to camelcase

### Fixed

- Removed empty `env` from workloads during mta transformation
- App name derivation fix in template function

## Version 0.2.0 - 21-August-2024

### Added

- Updated to CDS v8
- Updated `values.schema.json` to allow additional properties on `values.yaml`
- Removed unused variables from templates
- Unit test enhancements

## Version 0.1.0 - 25-July-2024

### Added

- New CLI to generate runtime values file `npx cap-op-plugin generate-runtime-values`
- Updated `values.schema.json` to the latest version of CAP Operator(v0.6.0) and BTP Service Operator(v0.6.5)
- Adds the `$XSAPPNAME.Callback` and `$XSAPPNAME.mtcallback` scopes to `xs-security.json` if they are not already present
- Switched helm chart to v2 apiVersion

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
