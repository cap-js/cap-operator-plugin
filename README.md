[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/cap-operator-plugin)](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin)

# CAP Operator Plugin

CAP Operator Plugin provides an easy way to generate [CAP Operator](https://sap.github.io/cap-operator/) resources to deploy multitenant CAP Applications.

## Requirements

The CAP Operator plugin requires `@sap/cds-dk: ">=7"`. If @sap/cds-dk is installed globally, please ensure that the installed version is greater than or equal to 7.

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
        > During `cds build`, the plugin will automatically inject the templates folder into the final chart.

    * To add a chart folder with templates included, use:
        ```sh
        cds add cap-operator --add-with-templates
        ```
        > During `cds build`, the plugin will copy the templates folder into the final chart.

    > [!CAUTION]
    > ### Experimental
    > To add a chart folder with the values.yaml prefilled with the design-time deployment details from the mta and mta extensions, use:
    >```sh
    > cds add cap-operator --add-with-mta <mta-yaml-file-path> --add-with-mta-extensions <mta-ext-yaml-file-path>
    >```
    > If you have multiple mta extensions, you can pass them as a comma-separated string in the order that they should be merged.

3. Once executed, the chart folder or chart folder with templates will be added to your project directory.

4. The `values.yaml` requires two type of details:

    * Design-time deployment details
        - serviceInstances
        - serviceBindings
        - workloads
        - tenantOperations
        - contentJobs
    * Runtime deployment details
        - app
        - btp
        - imagePullSecrets
        - env information inside each workload like database instance ID

    As an developer, you need to fill the design-time deployment details in the `values.yaml` file which can be pushed to your repository. Some of the design-time details will be prefilled by the plugin based on the project configuration. But this needs to be verified and the missing information should be filled in manually. You can refer to `values.schema.json` file for the structure of the `values.yaml` file. You can either use any YAML schema validation extension like [YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) or run the following command to ensure correctness of the `values.yaml` file:

    ```sh
    helm lint <chart-path>
    ```

5. After filling all the design-time information in `values.yaml`, run `cds build`. The final chart will be generated in the `gen` folder within your project directory.

6. Now to deploy the application, you can pass the runtime values in a separate `runtime-values.yaml` file and deploy the chart using the following command:

```sh
helm upgrade -i -n <namespace> <release-name> <chart-path> -f <runtime-values.yaml-path>
```

## Things to Note

* If you are adding the basic chart folder using the `cds add cap-operator` command, do not modify the `values.schema.json` file.The templates injected automatically during `cds build` are tightly coupled with the structure in `values.schema.json`. If schema changes are needed, use option `--add-with-templates` to add the templates folder and adjust them accordingly.

* When defining environment variables for workloads in the `values.yaml` file, it's important to mirror these definitions in the `runtime-values.yaml` file. This ensures consistency and avoids potential conflicts, as Helm does not merge arrays. If you're introducing new environment variables in `runtime-values.yaml` for a workload, remember to include existing variables from `values.yaml` to maintain coherence.

## Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/cap-operator-plugin/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin).
