# Migration Guide to v0.7.0

With the release of `v0.7.0`, there are **incompatible changes** you must address when migrating from previous versions.

> **Important:** This version is intended for use with CAP Operator `v0.15.0` or later. If you are using an older version (`<= v0.6.0`), it will still work seamlessly due to the CAP Operator’s [migration support](https://sap.github.io/cap-operator/docs/usage/domain-management/#migration-support). But to take advantage of the new features and improvements, you should update the plugin to `v0.7.0`.

## Key Change: Domain Configuration

The `app.domains.secondary` field in `values.yaml` has been **removed** and replaced with `app.domains.additionalDomainRefs`. This update aligns with the improved domain management introduced in CAP Operator [`v0.15.0`](https://github.com/SAP/cap-operator/releases/tag/v0.15.0).

The new `additionalDomainRefs` field enables you to reference existing `Domain` or `ClusterDomain` resources, providing greater flexibility and control over networking, TLS, ingress routing, and DNS setup. For more details, see the [CAP Operator documentation](https://sap.github.io/cap-operator/docs/usage/domain-management).

## Migration Steps

Follow the steps below based on your current chart setup:

### 1. Simple Chart (No `templates` Folder)

1. Force update the existing chart:
    ```sh
    cds add cap-operator --force
    ```
2. Accept all incoming changes in the `values.schema.json` file.
3. In your `values.yaml`, **rename** the `secondary` field to `additionalDomainRefs`:
    ```yaml
    app:
      domains:
        primary: myapp.example.com
        additionalDomainRefs: []
    ```
4. Rebuild your chart:
    ```sh
    cds build
    ```

### 2. Simple Chart (With `templates` Folder)

1. Force update the existing chart:
    ```sh
    cds add cap-operator --with-templates --force
    ```
2. Accept all incoming changes in:
    - `values.schema.json`
    - `templates/_helpers.tpl`
    - `templates/domain.yaml`
    - `templates/cap-operator-cros.yaml`
    - `templates/service-instance.yaml`

    > **Note:** If you have customized any of these files, review and merge changes manually to retain your modifications.

3. In your `values.yaml`, **rename** the `secondary` field to `additionalDomainRefs`:
    ```yaml
    app:
      domains:
        primary: myapp.example.com
        additionalDomainRefs: []
    ```

### 3. Configurable Chart

1. Force update the existing chart:
    ```sh
    cds add cap-operator --with-configurable-templates --force
    ```
2. Accept all incoming changes in:
    - `values.schema.json`
    - `templates/_helpers.tpl`
    - `templates/domain.yaml`
    - `templates/cap-operator-cros.yaml`
    - `templates/service-instance.yaml`

    > **Note:** If you have customized any of these files, review and merge changes manually to retain your modifications.

3. In your `values.yaml`, **rename** the `secondary` field to `additionalDomainRefs`:
    ```yaml
    app:
      domains:
        primary: myapp.example.com
        additionalDomainRefs: []

## Support

If you encounter issues or need further assistance, please consult the official documentation or open an issue in the [CAP Operator GitHub repository](https://github.com/SAP/cap-operator/issues).
