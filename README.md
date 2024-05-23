[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/cap-operator-plugin)](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin)

# CAP Operator Plugin

CAP Operator Plugin provides an easy way to generate [CAP Operator](https://sap.github.io/cap-operator/) resources to deploy multitenant CAP Applications.

## Requirements

The CAP Operator plugin requires `@sap/cds-dk: ">=7.8.1"`. If @sap/cds-dk is installed globally, please ensure that the installed version is greater than or equal to `7.8.1`.

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
        cds add cap-operator --with-templates
        ```
        > During `cds build`, the plugin will copy the templates folder into the final chart.

    > ### ⚠️ Experimental
    > To add a chart folder with the values.yaml prefilled with the design-time deployment details from the mta and mta extensions, use:
    >```sh
    > cds add cap-operator --with-mta <mta-yaml-file-path> --with-mta-extensions <mta-ext-yaml-file-path>
    >```
    > If you have multiple mta extensions, you can pass them as a comma-separated string to merge them.

2. Once executed, the chart folder or chart folder with templates will be added to your project directory.

3. The `values.yaml` requires two types of details:

    * Design-time deployment
        - [serviceInstances](https://github.com/SAP/sap-btp-service-operator?tab=readme-ov-file#service-instance)
        - [serviceBindings](https://github.com/SAP/sap-btp-service-operator?tab=readme-ov-file#service-binding)
        - workloads - There are two types of workloads:
            - [Deployment definition](https://sap.github.io/cap-operator/docs/usage/resources/capapplicationversion/#workloads-with-deploymentdefinition)
            - [Job definition](https://sap.github.io/cap-operator/docs/usage/resources/capapplicationversion/#workloads-with-jobdefinition)
        - [tenantOperations](https://sap.github.io/cap-operator/docs/usage/resources/capapplicationversion/#sequencing-tenant-operations)
        - [contentJobs](https://sap.github.io/cap-operator/docs/usage/resources/capapplicationversion/#sequencing-content-jobs)

    * Runtime deployment
        - app
            - Primary - Primary application domain will be used to generate a wildcard TLS certificate. In SAP Gardener managed clusters this is (usually) a subdomain of the cluster domain
            - Secondary - Customer specific domains to serve application endpoints (optional)
            - IstioIngressGatewayLabels - Labels used to identify the istio ingress-gateway component and its corresponding namespace. Usually {“app”:“istio-ingressgateway”,“istio”:“ingressgateway”}
        - btp
            - GlobalAccountId - SAP BTP Global Account Identifier where services are entitles for the current application
            - Subdomain - BTP subaccount subdomain
            - TenantId - BTP subaccount Tenant ID
        - [imagePullSecrets](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) - Registry secrets used to pull images of the application components
        - env information inside workloads

    As a developer, you must fill in the design-time deployment details in the `values.yaml` file, which can then be pushed to your repository. The plugin will auto-populate some of these details based on the project configuration, but verifying them and manually filling in any missing information is essential. You can refer to `values.schema.json` file for the structure of the `values.yaml` file.

    You can utilize a YAML schema validation extension such as [YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml), or run the following command to validate the `values.yaml` file. You can ignore the errors from runtime values as they are not filled in yet.

    ```sh
    helm lint <chart-path>
    ```

4. After filling all the design-time information in `values.yaml`, run `cds build`. The final chart will be generated in the `gen` folder within your project directory.

5. To deploy the application, you need to create `runtime-values.yaml` with all the runtimes values as mentioned above. For that you can make use of the plugin itself. The plugins provides two ways to generate the runtime values file -

    * **Interactive Mode** - This mode will ask you for all the runtime values one by one. To use this mode, run the following command:

        ```sh
        cds add cap-operator --generate-runtime-values-via-prompts
        ```

    * **File Mode** - Via this mode you can provide all the required runtime values in a yaml file. To use this mode, run the following command:

        ```sh
        cds add cap-operator --generate-runtime-values-via-input-yaml <yaml-file-path>
        ```

        Sample input yaml -

        ```yaml
        appName: incidentapp
        capOperatorSubdomain: cap-op
        clusterDomain: abc.com
        globalAccountId: abcdef-abcd-4ef1-9263-1b6b7b6b7b6b
        providerSubdomain: provider-subdomain-1234
        tenantId: da37c8e0-74d4-abcd-b5e2-sd8f7d8f7d8f
        hanaInstanceId: 46e285d9-abcd-4c7d-8ebb-502sd8f7d8f7d
        imagePullSecret: regcred
        ```

    The `runtime-values.yaml` file will be created in the chart folder of your project directory.

5. Now you can finally deploy the application using the following command:

   ```sh
   helm upgrade -i -n <namespace> <release-name> <project-path>/gen/chart -f <runtime-values.yaml-path>
   ```

   > If you are using `xsuaa` service instance and want to set the `xs-security.json` as a parameter, you can do so by setting the `jsonParameters` attribute on the `xsuaa` service instance as follows:
   >```sh
   > helm upgrade -i -n <namespace> <release-name> <project-path>/gen/chart --set-file serviceInstances.xsuaa.jsonParameters=<project-path>/xs-security.json -f <runtime-values.yaml-path>
   >```

As a reference, you can check out the [CAP Operator helm chart](https://github.com/cap-js/incidents-app/tree/cap-operator-plugin/chart) in the sample incident app. And also the corresponding [runtime-values.yaml](https://github.com/cap-js/incidents-app/blob/cap-operator-plugin/chart/runtime-values.yaml) file.

## ❗Things to Note

* If you are adding the basic chart folder using the `cds add cap-operator` command, do not modify the `values.schema.json` file. The templates injected automatically during `cds build` are tightly coupled with the structure in `values.schema.json`. If schema changes are needed, use option `--with-templates` to add the templates folder and adjust them accordingly.

* When defining environment variables for workloads in the `values.yaml` file, it's important to mirror these definitions in the `runtime-values.yaml` file. This ensures consistency and avoids potential conflicts, as Helm does not merge arrays. If you're introducing new environment variables in `runtime-values.yaml` for a workload, remember to include existing variables from `values.yaml` to maintain coherence.

## Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/cap-operator-plugin/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/cap-operator-plugin).
