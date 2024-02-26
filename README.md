[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/cap-operator-plugin)](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin)

# CAP Operator Plugin

CAP Operator Plugin provides an easy way to generate [CAP Operator](https://sap.github.io/cap-operator/) resources to deploy multitenant CAP Applications.

## Setup

To integrate the CAP Operator Plugin into your project, follow these steps:

1. Add this self-configuring plugin package to your project:

```sh
 npm add @cap-js/cap-operator-plugin -D
```

2. After installation, execute one of the following commands based on your requirements:

* To add a basic chart folder, use:
```sh
 cds add cap-operator
```
During `cds build`, the plugin will automatically inject the templates folder into the final chart.

* To add a chart folder with templates included, use:
```sh
 cds add cap-operator-with-templates
```
During `cds build`, the plugin will copy the templates folder into the final chart.

3. Once executed, the chart folder or chart folder with templates will be added to your project directory.

4. Update the `values.yaml` file with your design-time deployment details according to `values.schema.json`. You can either use any YAML schema validation extension or run the following command to ensure correctness:
```sh
helm lint <chart-path>
```

5. After filling all the design-time information in `values.yaml`, run `cds build`. The final chart will be generated in the `gen` folder within your project directory.

> Note: If you are adding the basic chart folder using the `cds add cap-operator` command, do not modify the `values.schema.json` file. The templates injected automatically during cds build are tightly coupled with the structure in `values.schema.json`. If schema changes are needed, use `cds add cap-operator-with-templates` to add the templates folder and adjust them accordingly.

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/cap-operator-plugin/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin).
