# Migration Guide to v0.7.0

With the release of `v0.7.0`, there are incompactible changes you need to consider when migrating from earlier versions.

> **Use this version only if you are running CAP Operator v0.15.0 or newer.**

The field `app.domains.secondary` in `values.yaml` has been removed and replaced with `app.domains.additionalDomainRefs`. This change aligns with the enhanced domain management introduced in the CAP Operator [`v0.15.0`](https://github.com/SAP/cap-operator/releases/tag/v0.15.0) release.

The new `additionalDomainRefs` field allows you to reference existing `Domain` or `ClusterDomain` resources. This offers enhanced control over CAP applications networking behaviour, including TLS handling, ingress routing, and DNS setup. For details, refer to the [CAP Operator documentation](https://sap.github.io/cap-operator/docs/usage/domain-management).

## Migration steps

To migrate your existing charts to the new version, follow these steps based on your current setup:

### 1. Simple chart with no templates folder

Execute the following command:

```sh
cds add cap-operator --force
```
- Accept all incoming changes in the `values.schema.json` file.

- Rename `secondary` to `additionalDomainRefs` in the `values.yaml` file.

    ```yaml
    app:
        domains:
            primary: myapp.example.com
            additionalDomainRefs: []
    ```
Rebuild the chart by executing `cds build`.

### 2. Simple chart with templates folders

Execute the following command:

```sh
cds add cap-operator --with-templates --force
```

- Accept all incoming changes in `values.schema.json`, `templates/_helpers.tpl`, `templates/domain.yaml`, `templates/cap-operator-cros.yaml`, and `templates/service-instance.yaml`. **If you have modified any of these files, review and merge changes manually to preserve your customizations.**

- Rename `secondary` to `additionalDomainRefs` in the `values.yaml` file.

    ```yaml
    app:
        domains:
            primary: myapp.example.com
            additionalDomainRefs: []
    ```

### 3. Configurable chart

Execute the following command:

```sh
cds add cap-operator --with-configurable-templates --force
```

- Accept all incoming changes in `values.schema.json`, `templates/_helpers.tpl`, `templates/domain.yaml`, `templates/cap-operator-cros.yaml`, and `templates/service-instance.yaml`. **If you have modified any of these files, review and merge changes manually to preserve your customizations.**

- Rename `secondary` to `additionalDomainRefs` in the `values.yaml` file.

    ```yaml
    app:
        domains:
            primary: myapp.example.com
            additionalDomainRefs: []
    ```
