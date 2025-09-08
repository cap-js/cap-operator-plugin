# Change Log

All notable changes to this project will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org/). The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.9.0 - 08-September-2025

### Fixed

- Removed redundant `oauth2-configuration.redirect-uris` and `TENANT_HOST_PATTERN` from the generated `runtime-values.yaml` file as it is now handled in the corresponding templates.

## Version 0.8.0 - 20-August-2025

### Added

- Schema update to align with the latest CAP Operator version `v0.19.0`.

## Version 0.7.1 - 26-June-2025

### Fixed

- User provided env values in router workload getting replaced by the template instead of merging them.

## Version 0.7.0 - 16-June-2025

### Added

- Added support for the new [Domain Management](https://sap.github.io/cap-operator/docs/usage/domain-management) feature introduced in the CAP Operator [`v0.15.0`](https://github.com/SAP/cap-operator/releases/tag/v0.15.0). This version is intended for use with CAP Operator `v0.15.0` or later.
    > Note: This version includes breaking changes. If you're upgrading from an earlier release, please consult the [migration guide](https://github.com/cap-js/cap-operator-plugin/blob/main/migration-guide.md) to ensure a smooth transition.
- Dependencies updated
- `values.yaml` schema has been updated to align with the CAP Operator version `v0.15.0` and the BTP Service Operator version `v0.7.7`.

## Version 0.6.0 - 13-May-2025

### Added

- Support for service only helm charts. For more details visit the [Service Only Applications documentation](https://sap.github.io/cap-operator/docs/usage/services-workload/) page.
- Dependencies updated
- `values.yaml` schema has been updated to align with the CAP Operator version v0.14.0 and the BTP Service Operator version v0.7.2

## Version 0.5.0 - 14-January-2025

### Added

- Dependencies updated
- `values.yaml` schema has been updated to align with the latest versions of the CAP Operator(v0.11.1) and the BTP Service Operator(v0.7.1)

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
