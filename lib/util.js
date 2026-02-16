/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const yaml = require('@sap/cds-foss').yaml
const enquirer = require('enquirer')

function replacePlaceholders(obj, replacements) {
  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      // If it's an array, recursively process each element
      for (let i = 0; i < obj.length; i++) {
        obj[i] = replacePlaceholders(obj[i], replacements)
      }
    } else {
      // If it's an object, recursively process each property
      for (const prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          obj[prop] = replacePlaceholders(obj[prop], replacements)
        }
      }
    }
  } else if (typeof obj === "string") {
    // If it's a string, replace placeholders
    Object.entries(replacements).forEach(([placeholder, value]) => {
      const regex = new RegExp("\\${" + placeholder + "}", "g")
      obj = obj.replace(regex, value)
    })
  }
  return obj
}

function _isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

function mergeObj(source, target) {
  const unique = array => [...new Set(array.map(JSON.stringify))].map(JSON.parse)
  if (_isObject(target) && _isObject(source)) {
    for (const key in source) {
      if (_isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: source[key] })
        else mergeObj(source[key], target[key])
      } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        target[key] = unique([...source[key], ...target[key]])
      } else {
        Object.assign(target, { [key]: target[key] || source[key] })
      }
    }
  } else if (Array.isArray(target) && Array.isArray(source)) {
    target = unique([...source, ...target])
  }
  return target ?? source
}

function isCAPOperatorChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(cds.utils.fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/managed-by"] === 'cap-operator-plugin' || false
  } catch (err) {
    return false
  }
}

function isConfigurableTemplateChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(cds.utils.fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/part-of"] === 'cap-operator-configurable-templates' || false
  } catch (err) {
    return false
  }
}

function isServiceOnlyChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(cds.utils.fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/component"] === 'service-only' || false
  } catch (err) {
    return false
  }
}

// Allow injecting a custom prompt function for testing
let _promptFn = null

function setPromptFunction(fn) {
  _promptFn = fn
}

async function ask(...args) {
  const questions = args.map(([message, initial, mandatory], index) => ({
    type: 'input',
    name: String(index),
    message,
    initial: initial || '',
    required: mandatory && !initial,
    separator: ''
  }))

  const promptFn = _promptFn || enquirer.prompt.bind(enquirer)
  const response = await promptFn(questions)
  return args.map((_, index) => {
    const value = response[String(index)]
    return value?.trim() || args[index][1] || ''
  })
}

// Helper: Set or update an env variable in an env array
function upsertEnvVar(env, envVar) {
  const index = env.findIndex(e => e.name === envVar.name)
  if (index === -1) env.push(envVar)
  else env[index].value = envVar.value
}

// Helper: Extract hanaInstanceId from CDS_CONFIG and replace with template placeholder
function extractAndReplaceHanaInstanceId(env, valuesYaml) {
  const index = env.findIndex(e => e.name === 'CDS_CONFIG')
  if (index === -1) return

  try {
    const cdsConfig = JSON.parse(env[index].value)
    const databaseId = cdsConfig?.requires?.['cds.xt.DeploymentService']?.hdi?.create?.database_id
    if (databaseId) {
      valuesYaml['hanaInstanceId'] = databaseId
      cdsConfig.requires['cds.xt.DeploymentService'].hdi.create.database_id = '{{.Values.hanaInstanceId}}'
      env[index].value = JSON.stringify(cdsConfig)
    }
  } catch (err) {
    console.warn(`Failed to parse CDS_CONFIG: ${error.message}`)
  }
}

// Helper: Append a section to the spec in the CRO YAML
function appendToSpec(yamlContent, key, value, indent = 2) {
  return yamlContent.replace(
    /spec:\n((?:.*\n)*?)(\n[^ ]|$)/gm,
    (match, p1, p2) => `spec:\n${p1}  ${yaml.stringify({ [key]: value }, { indent })}${p2}`
  )
}

async function transformValuesAndFillCapOpCroYaml() {
  const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))
  let capOpCROYaml = cds.utils.fs.readFileSync(cds.utils.path.join(cds.root, 'chart/templates/cap-operator-cros.yaml'), 'utf8')

  const tenantHostPattern = { name: 'TENANT_HOST_PATTERN', value: '{{ include "tenantHostPattern" . }}' }
  const workloadArray = []
  const newWorkloadObj = {}

  for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {
    const { deploymentDefinition, jobDefinition } = workloadDetails
    const definition = deploymentDefinition || jobDefinition

    // Handle Router: add/update TENANT_HOST_PATTERN
    if (deploymentDefinition?.type === 'Router') {
      deploymentDefinition.env = deploymentDefinition.env || []
      upsertEnvVar(deploymentDefinition.env, tenantHostPattern)
    }
    // Handle CAP/Service deployments or TenantOperation jobs: extract hanaInstanceId
    else if ((deploymentDefinition?.type === 'CAP' || deploymentDefinition?.type === 'Service') && deploymentDefinition.env) {
      extractAndReplaceHanaInstanceId(deploymentDefinition.env, valuesYaml)
    }
    else if (jobDefinition?.type === 'TenantOperation' && jobDefinition.env) {
      extractAndReplaceHanaInstanceId(jobDefinition.env, valuesYaml)
    }

    // Replace image with template placeholder
    const workloadKeyCamelCase = convertHypenNameToCamelcase(workloadKey)
    newWorkloadObj[workloadKeyCamelCase] = { image: definition.image }
    definition.image = `{{.Values.workloads.${workloadKeyCamelCase}.image}}`

    workloadArray.push(workloadDetails)
  }

  // Update workloads in CRO YAML
  capOpCROYaml = capOpCROYaml.replace(
    /workloads:(?:\s*\[\])?(?:\n(.*\n)*?)?(?=\n\s{2,}- name|spec:|$)/gm,
    yaml.stringify({ workloads: workloadArray }, { indent: 2 })
  )

  // Move tenantOperations, contentJobs, serviceExposures from values.yaml to CRO YAML
  for (const [key, indent] of [['tenantOperations', 4], ['contentJobs', 2], ['serviceExposures', 2]]) {
    if (valuesYaml[key]) {
      capOpCROYaml = appendToSpec(capOpCROYaml, key, valuesYaml[key], indent)
      delete valuesYaml[key]
    }
  }

  await cds.utils.write(capOpCROYaml).to(cds.utils.path.join(cds.root, 'chart/templates/cap-operator-cros.yaml'))

  valuesYaml.workloads = newWorkloadObj
  await cds.utils.write(yaml.stringify(valuesYaml)).to(cds.utils.path.join(cds.root, 'chart/values.yaml'))
}

function convertHypenNameToCamelcase(str) {
  if (!str.includes('-')) {
    return str
  }
  return str
    .split('-') // Split the string into an array by the hyphen
    .map((word, index) => {
      // Capitalize the first letter of each word except the first word
      if (index === 0) {
        return word // Keep the first word in lowercase
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    }).join('') // Join the words back together without spaces
}

function getServiceInstanceKeyName(serviceInstances, offeringName) {
  if (!serviceInstances) return null
  return Object.keys(serviceInstances).find(
    key => serviceInstances[key].serviceOfferingName === offeringName
  ) ?? null
}

function yamlBuilder() {
  const lines = []
  let indent = 0

  const push = (line = '') => {
    if (Array.isArray(line)) {
      lines.push(...line.map(l => l === '\n' ? '' : ' '.repeat(indent) + l))
    } else {
      lines.push(line === '\n' ? '' : ' '.repeat(indent) + line)
    }
  }

  const inc = (n = 2) => (indent += n)
  const dec = (n = 2) => (indent = Math.max(0, indent - n))

  const block = (headerLines = [], fn) => {
    if (headerLines.length) push(headerLines)
    inc()
    fn()
    dec()
  }

  return { push, block, inc, dec, toString: () => lines.join('\n') + '\n' }
}

function writeCAPApplicationCRO(yaml, hasIas, isService) {
  yaml.push([
    '---',
    'apiVersion: sme.sap.com/v1alpha1',
    'kind: CAPApplication'
  ])

  yaml.block(['metadata:'], () => {
    yaml.push('name: {{ include "appName" $ }}')
    if (hasIas) {
      yaml.block(['annotations:'], () => {
        yaml.push([
          'sme.sap.com/vs-route-request-header-set: |',
          '  {',
          '    "x-forwarded-client-cert": "%DOWNSTREAM_PEER_CERT%"',
          '  }'
        ])
      })
    }
  })

  yaml.block(['spec:'], () => {
    yaml.push([
      'domainRefs:',
      '- kind: Domain',
      '  name: {{ include "domainName" $ }}',
      '{{- range .Values.app.domains.additionalDomainRefs }}',
      '- kind: {{ .kind }}',
      '  name: {{ .name }}',
      '{{- end }}',
      'btpAppName: {{ include "appName" $ }}',
      'globalAccountId: {{ .Values.btp.globalAccountId }}'
    ])

    if (!isService) {
      yaml.block(['provider:'], () => {
        yaml.push([
          'subDomain: {{ .Values.btp.provider.subdomain }}',
          'tenantId: {{ .Values.btp.provider.tenantId }}'
        ])
      })
    }

    yaml.block(['btp:'], () => {
      yaml.push('services:')
      yaml.push([
        '{{- $serviceInstances := .Values.serviceInstances }}',
        '{{- range $k, $v := .Values.serviceBindings }}',
        '{{- $serviceInstance := dict }}',
        '{{- range $sik, $siv := $serviceInstances }}',
        '  {{- if eq $siv.name $v.serviceInstanceName }}',
        '    {{- $serviceInstance = $siv }}',
        '  {{- end }}',
        '{{- end }}',
        '{{- if hasKey $serviceInstance "serviceOfferingName" }}',
        '- class: {{ get $serviceInstance "serviceOfferingName" | default "invalidValue" }}',
        '  {{- if $v.externalName }}',
        '  name: {{ $v.externalName | default "invalidValue" }}',
        '  {{- else }}',
        '  name: {{ $v.name | default "invalidValue" }}',
        '  {{- end }}',
        '  secret: {{ $v.secretName | default "invalidValue" }}',
        '{{- end }}',
        '{{- end }}'
      ])
    })
  })
}

function writeCAPApplicationVersionCommonCRO(yaml) {
  // Common part of CAPApplicationVersion can be added here if needed in the future
  yaml.push([
    '---',
    'apiVersion: sme.sap.com/v1alpha1',
    'kind: CAPApplicationVersion',
    'metadata:',
    '  annotations:',
    '    helm.sh/hook: post-install,post-upgrade',
    '    helm.sh/resource-policy: keep',
    '  name: {{ include "capApplicationVersionName" $ }}',
    'spec:',
    '  capApplicationInstance: {{ include "appName" $ }}',
    '  version: "{{ .Release.Revision }}"',
    '  registrySecrets:',
    '  {{- range .Values.imagePullSecrets }}',
    '  - {{ . }}',
    '  {{- end }}'
  ])
}

function getConfigurableCapOpCroYaml(project) {
  const yaml = yamlBuilder()
  const { hasDestination, hasHtml5Repo, hasXsuaa, hasApprouter, hasMultitenancy, hasIas, isService, hasAms } = project

  // === CAPApplicationCRO ===
  writeCAPApplicationCRO(yaml, hasIas, isService)

  // === CAPApplicationVersion Common===
  writeCAPApplicationVersionCommonCRO(yaml)

  // === Workloads ===
  yaml.push('  workloads:')
  yaml.inc() // indent workloads items

  // --- Server Workload ---
  yaml.block([
    '- name: server',
    '  labels:',
    '    sme.sap.com/app-type: {{ include "appName" $ }}',
    '  consumedBTPServices:'], () => {
      if (hasXsuaa) yaml.push('- {{ include "originalAppName" $ }}-uaa-bind')
      if (hasIas) yaml.push('- {{ include "originalAppName" $ }}-identity-bind')
      if (hasMultitenancy && hasXsuaa) {
        yaml.push([
          '- {{ include "originalAppName" $ }}-saas-registry-bind',
          '- {{ include "originalAppName" $ }}-service-manager-bind'
        ])
      }
      if (hasMultitenancy && hasIas) {
        yaml.push([
          '- {{ include "originalAppName" $ }}-subscription-manager-bind',
          '- {{ include "originalAppName" $ }}-service-manager-bind'
        ])
      }

      yaml.block(['deploymentDefinition:'], () => {
        if (isService) {
          yaml.push([
            'type: Service',
            'ports:',
            '- name: server-port',
            '  port: 4004',
            '  appProtocol: http'
          ])
        } else {
          yaml.push('type: CAP')
        }
        yaml.push([
          'image: {{ .Values.workloads.server.image }}',
        ])

        if (hasAms) {
          yaml.push([
            `env:`,
            `- name: AMS_DCL_ROOT`,
            `  value: ams/dcl`,
            '{{- if .Values.hanaInstanceId }}',
            '- name: CDS_CONFIG',
            '  value: \'{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{ .Values.hanaInstanceId }}"}}}}}\'',
            '{{- end }}',
            `securityContext:`,
            `  runAsUser: 1000`,
            `  runAsGroup: 1000`
          ])
        } else {
          yaml.push([
            '{{- if .Values.hanaInstanceId }}',
            'env:',
            '- name: CDS_CONFIG',
            '  value: \'{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{ .Values.hanaInstanceId }}"}}}}}\'',
            '{{- end }}'
          ])
        }
      })
    })

  // --- App Router Workload ---
  if (hasApprouter) {
    yaml.block([
      '- name: app-router',
      '  labels:',
      '    sme.sap.com/app-type: {{ include "appName" $ }}',
      '  consumedBTPServices:'], () => {
        if (hasXsuaa) yaml.push('- {{ include "originalAppName" $ }}-uaa-bind')
        if (hasIas) yaml.push('- {{ include "originalAppName" $ }}-identity-bind')
        if (hasMultitenancy && hasXsuaa) yaml.push('- {{ include "originalAppName" $ }}-saas-registry-bind')
        if (hasMultitenancy && hasIas) yaml.push('- {{ include "originalAppName" $ }}-subscription-manager-bind')
        if (hasDestination) yaml.push('- {{ include "originalAppName" $ }}-destination-bind')
        if (hasHtml5Repo) yaml.push('- {{ include "originalAppName" $ }}-html5-repo-runtime-bind')

        yaml.block(['deploymentDefinition:'], () => {
          yaml.push([
            'type: Router',
            'image: {{ .Values.workloads.appRouter.image }}',
            'env:',
            '- name: TENANT_HOST_PATTERN',
            '  value: {{ include "tenantHostPattern" . }}',
            'ports:',
            '- name: router-port',
            '  port: 5000'
          ])
        })
      })
  }

  // --- Tenant Job Workload ---
  if (!isService) {
    yaml.block([
      '- name: tenant-job',
      '  labels:',
      '    sme.sap.com/app-type: {{ include "appName" $ }}',
      '  consumedBTPServices:'], () => {
        if (hasXsuaa) yaml.push('- {{ include "originalAppName" $ }}-uaa-bind')
        if (hasIas) yaml.push('- {{ include "originalAppName" $ }}-identity-bind')
        if (hasMultitenancy && hasXsuaa) {
          yaml.push([
            '- {{ include "originalAppName" $ }}-saas-registry-bind',
            '- {{ include "originalAppName" $ }}-service-manager-bind'
          ])
        }
        if (hasMultitenancy && hasIas) {
          yaml.push([
            '- {{ include "originalAppName" $ }}-subscription-manager-bind',
            '- {{ include "originalAppName" $ }}-service-manager-bind'
          ])
        }

        yaml.block(['jobDefinition:'], () => {
          yaml.push([
            'type: TenantOperation',
            'image: {{ .Values.workloads.tenantJob.image }}',
            '{{- if .Values.hanaInstanceId }}',
            'env:',
            '- name: CDS_CONFIG',
            '  value: \'{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{ .Values.hanaInstanceId }}"}}}}}\'',
            '{{- end }}'
          ])
        })
      })
  }

  // --- Content Deploy Job ---
  yaml.block([
    '- name: content-deploy',
    '  labels:',
    '    sme.sap.com/app-type: {{ include "appName" $ }}',
    '  consumedBTPServices:'], () => {
      if (hasXsuaa) yaml.push('- {{ include "originalAppName" $ }}-uaa-bind')
      if (hasIas) yaml.push('- {{ include "originalAppName" $ }}-identity-bind')
      if (hasHtml5Repo) yaml.push('- {{ include "originalAppName" $ }}-html5-repo-host-bind')

      yaml.block(['jobDefinition:'], () => {
        yaml.push([
          'type: Content',
          'image: {{ .Values.workloads.contentDeploy.image }}'
        ])
      })
    })

  // -- AMS Deployer Content Job ---
  if (hasAms) {
    yaml.block([
      '- name: ams-deployer',
      '  labels:',
      '    sme.sap.com/app-type: {{ include "appName" $ }}',
      '  consumedBTPServices:'], () => {
        if (hasIas) yaml.push('- {{ include "originalAppName" $ }}-identity-bind')

        yaml.block(['jobDefinition:'], () => {
          yaml.push([
            'type: Content',
            'image: {{ .Values.workloads.amsDeployer.image }}'
          ])
        })
      })
  }

  yaml.dec() // unindent workloads

  // --- Service Exposure ---
  if (isService) {
    yaml.block(['  serviceExposures:'], () => {
      yaml.block([
        '- subDomain: {{ include "appName" $ }}',
        '  routes:'], () => {
          yaml.push([
            '- workloadName: server',
            '  port: 4004'
          ])
        })
    })
  }

  // -- Content Jobs ---
  if (hasAms) {
    yaml.block(['  contentJobs:'], () => {
      yaml.push([
        '- content-deploy',
        '- ams-deployer'
      ])
    })
  }

  return yaml.toString()
}

function getCAPOpCroYaml(project) {
  const yaml = yamlBuilder()
  const { hasIas, isService } = project

  // === CAPApplicationCRO ===
  writeCAPApplicationCRO(yaml, hasIas, isService)

  // === CAPApplicationVersion Common===
  writeCAPApplicationVersionCommonCRO(yaml)

  // === Workloads ===
  yaml.block(['  workloads:'], () => {
    yaml.push([
      '{{- range $k, $v := .Values.workloads }}',
      '- name: {{ $v.name }}',
      '\n',
      '  {{- if $v.labels }}',
      '  labels: {{- toYaml $v.labels | trim | nindent 6 }}',
      '  {{- end }}',
      '\n',
      '  {{- if $v.annotations }}',
      '  annotations: {{- toYaml $v.annotations | trim | nindent 6 }}',
      '  {{- end }}',
      '\n',
      '  {{- if $v.consumedBTPServices }}',
      '  consumedBTPServices: {{- toYaml $v.consumedBTPServices | trim | nindent 4 }}',
      '  {{- end }}',
      '\n',
      '  {{- if and $v.deploymentDefinition (eq $v.deploymentDefinition.type "Router") }}',
      '  {{- $thp := include "tenantHostPattern" $ }}',
      '  {{- $tphEnv := list (dict "name" "TENANT_HOST_PATTERN" "value" $thp) }}',
      '  {{- $baseEnv := get $v.deploymentDefinition "env" | default (list) }}',
      '  {{- $exists := false }}',
      '  {{- range $baseVar := $baseEnv }}',
      '  {{- if eq $baseVar.name "TENANT_HOST_PATTERN" }}',
      '  {{- $exists = true }}',
      '  {{- end }}',
      '  {{- end }}',
      '  {{- if not $exists }}',
      '  {{- $baseEnv = concat $baseEnv $tphEnv }}',
      '  {{- end }}',
      '  {{- $modified := merge (dict "env" $baseEnv) $v.deploymentDefinition }}',
      '  deploymentDefinition: {{- toYaml $modified | trim | nindent 6 }}',
      '  {{- else if $v.deploymentDefinition }}',
      '  deploymentDefinition: {{- toYaml $v.deploymentDefinition | trim | nindent 6 }}',
      '  {{- end }}',
      '\n',
      '  {{- if $v.jobDefinition }}',
      '  jobDefinition: {{- toYaml $v.jobDefinition | trim | nindent 6 }}',
      '  {{- end }}',
      '{{- end }}'
    ])
  })

  if (!isService) {
    yaml.push([
      '\n',
      '  {{- if .Values.tenantOperations }}',
      '  tenantOperations: {{- toYaml .Values.tenantOperations | trim | nindent 4 }}',
      '  {{- end }}'
    ])
  }

  yaml.push([
    '\n',
    '  {{- if .Values.contentJobs }}',
    '  contentJobs: {{- toYaml .Values.contentJobs | trim | nindent 4 }}',
    '  {{- end }}'
  ])

  // --- Service Exposure ---
  if (isService) {
    yaml.push([
      '\n',
      '  {{- if .Values.serviceExposures }}',
      '  serviceExposures: {{- toYaml .Values.serviceExposures | trim | nindent 4 }}',
      '  {{- end }}'
    ])
  }

  return yaml.toString()
}

function getDomainCroYaml(project) {
  const yaml = yamlBuilder()
  const { hasIas } = project

  yaml.push([
    'apiVersion: sme.sap.com/v1alpha1',
    'kind: Domain'
  ])

  yaml.block(['metadata:'], () => {
    yaml.push('name: {{ include "domainName" $ }}')
  })

  yaml.block(['spec:'], () => {
    yaml.push([
      'dnsMode: Wildcard',
      'domain: {{ .Values.app.domains.primary }}',
      'ingressSelector:',
      '{{- range $k, $v := $.Values.app.istioIngressGatewayLabels }}',
      '  {{ $k }}: {{ $v | default "invalidValue" }}',
      '{{- end }}',
    ])

    if (hasIas) {
      yaml.push([
        'certConfig:',
        '  additionalCACertificate: |',
        '    -----BEGIN CERTIFICATE-----',
        '    MIIFZjCCA06gAwIBAgIQGHcPvmUGa79M6pM42bGFYjANBgkqhkiG9w0BAQsFADBN',
        '    MQswCQYDVQQGEwJERTERMA8GA1UEBwwIV2FsbGRvcmYxDzANBgNVBAoMBlNBUCBT',
        '    RTEaMBgGA1UEAwwRU0FQIENsb3VkIFJvb3QgQ0EwHhcNMTkwMjEzMTExOTM2WhcN',
        '    MzkwMjEzMTEyNjMyWjBNMQswCQYDVQQGEwJERTERMA8GA1UEBwwIV2FsbGRvcmYx',
        '    DzANBgNVBAoMBlNBUCBTRTEaMBgGA1UEAwwRU0FQIENsb3VkIFJvb3QgQ0EwggIi',
        '    MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQChbHLXJoe/zFag6fB3IcN3d3HT',
        '    Y14nSkEZIuUzYs7B96GFxQi0T/2s971JFiLfB4KaCG+UcG3dLXf1H/wewq8ahArh',
        '    FTsu4UR71ePUQiYlk/G68EFSy2zWYAJliXJS5k0DFMIWHD1lbSjCF3gPVJSUKf+v',
        '    HmWD5e9vcuiPBlSCaEnSeimYRhg0ITmi3RJ4Wu7H0Xp7tDd5z4HUKuyi9XRinfvG',
        '    kPALiBaX01QRC51cixmo0rhVe7qsNh7WDnLNBZeA0kkxNhLKDl8J6fQHKDdDEzmZ',
        '    KhK5KxL5p5YIZWZ8eEdNRoYRMXR0PxmHvRanzRvSVlXSbfqxaKlORfJJ1ah1bRNt',
        '    o0ngAQchTghsrRuf3Qh/2Kn29IuBy4bjKR9CdNLxGrClvX/q26rUUlz6A3lbXbwJ',
        '    EHSRnendRfEiia+xfZD+NG2oZW0IdTXSqkCbnBnign+uxGH5ECjuLEtvtUx6i9Ae',
        '    xAvK2FqIuud+AchqiZBKzmQAhUjKUoACzNP2Bx2zgJOeB0BqGvf6aldG0n2hYxJF',
        '    8Xssc8TBlwvAqtiubP/UxJJPs+IHqU+zjm7KdP6dM2sbE+J9O3n8DzOP0SDyEmWU',
        '    UCwnmoPOQlq1z6fH9ghcp9bDdbh6adXM8I+SUYUcfvupOzBU7rWHxDCXld/24tpI',
        '    FA7FRzHwKXqMSjwtBQIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/',
        '    BAUwAwEB/zAdBgNVHQ4EFgQUHLxmKw7KjUufjZNxqQ/KZ0ZpEyIwDQYJKoZIhvcN',
        '    AQELBQADggIBABdSKQsh3EfVoqplSIx6X43y2Pp+kHZLtEsRWMzgO5LhYy2/Fvel',
        '    eRBw/XEiB5iKuEGhxHz/Gqe0gZixw3SsHB1Q464EbGT4tPQ2UiMhiiDho9hVe6tX',
        '    qX1FhrhycAD1xHIxMxQP/buX9s9arFZauZrpw/Jj4tGp7aEj4hypWpO9tzjdBthy',
        '    5vXSviU8L2HyiQpVND/Rp+dNJmVYTiFLuULRY28QbikgFO2xp9s4RNkDBnbDeTrT',
        '    CKWcVsmlZLPJJQZm0n2p8CvoeAsKzIULT9YSbEEBwmeqRlmbUaoT/rUGoobSFcrP',
        '    jrBg66y5hA2w7S3tDH0GjMpRu16b2u0hYQocUDuMlyhrkhsO+Qtqkz1ubwHCJ8PA',
        '    RJw6zYl9VeBtgI5F69AEJdkAgYfvPw5DJipgVuQDSv7ezi6ZcI75939ENGjSyLVy',
        '    4SuP99G7DuItG008T8AYFUHAM2h/yskVyvoZ8+gZx54TC9aY9gPIKyX++4bHv5BC',
        '    qbEdU46N05R+AIBW2KvWozQkjhSQCbzcp6DHXLoZINI6y0WOImzXrvLUSIm4CBaj',
        '    6MTXInIkmitdURnmpxTxLva5Kbng/u20u5ylIQKqpcD8HWX97lLVbmbnPkbpKxo+',
        '    LvHPhNDM3rMsLu06agF4JTbO8ANYtWQTx0PVrZKJu+8fcIaUp7MVBIVZ',
        '    -----END CERTIFICATE-----',
        'tlsMode: OptionalMutual'
      ])
    } else {
      yaml.push('tlsMode: Simple')
    }
  })

  return yaml.toString()
}

function getHelperTpl(project, isConfigurableTemplateChart) {
  const yaml = yamlBuilder()
  const { hasXsuaa } = project

  yaml.push([
    '{{- define "capApplicationVersionName" -}}',
    '{{ printf "%s-%d" (include "appName" $) (.Release.Revision) }}',
    '{{- end -}}',
    '\n',
    '{{- define "domainName" -}}',
    '{{ printf "%s-primary" (include "appName" $)}}',
    '{{- end -}}',
    '\n'
  ])
  if (hasXsuaa) {
    yaml.push([
      '{{- define "appName" -}}',
      '{{- range $sik, $siv := .Values.serviceInstances }}',
      '  {{- if and (eq (get $siv "serviceOfferingName") "xsuaa") (eq (get $siv "servicePlanName") "broker") -}}',
      '    {{ printf "%s" $siv.parameters.xsappname }}',
      '    {{- break -}}',
      '  {{- end -}}',
      '{{- end -}}',
      '{{- end -}}',
      '\n'
    ])
  } else {
    yaml.push([
      '{{- define "appName" -}}',
      '{{- range $sik, $siv := .Values.serviceInstances }}',
      '  {{- if and (eq (get $siv "serviceOfferingName") "subscription-manager") (eq (get $siv "servicePlanName") "provider") -}}',
      '    {{ printf "%s" $siv.parameters.appName }}',
      '    {{- break -}}',
      '  {{- end -}}',
      '{{- end -}}',
      '{{- end -}}',
      '\n'
    ])
  }
  yaml.push([
    '{{- define "domainHostMap" -}}',
    '  {{- $domains := list .Values.app.domains.primary -}}',
    '  {{- range .Values.app.domains.additionalDomainRefs }}',
    '    {{- $apiVersion := "sme.sap.com/v1alpha1" -}}',
    '    {{- $namespace := (eq .kind "Domain" | ternary $.Release.Namespace "") -}}',
    '    {{- $resource := (lookup $apiVersion .kind $namespace .name) -}}',
    '    {{- if and $resource (kindIs "map" $resource) (hasKey $resource "spec") (hasKey $resource.spec "domain") -}}',
    '      {{- $domains = append $domains $resource.spec.domain -}}',
    '    {{- end -}}',
    '  {{- end -}}',
    '  {{- toJson (dict "domains" $domains) -}}',
    '{{- end }}',
    '\n',
    '{{- define "redirectUris" -}}',
    '  {{- $ctx := .context -}}',
    '  {{- $svc := .serviceOfferingName -}}',
    '  {{- $domains := (include "domainHostMap" $ctx | fromJson).domains -}}',
    '  {{- $redirectUris := list -}}',
    '  {{- range $domains }}',
    '    {{- $redirectUris = append $redirectUris (printf "https://*.%s/**" .) -}}',
    '  {{- end -}}',
    '  {{- if eq $svc "identity" }}',
    '    {{- toJson (dict "redirect-uris" $redirectUris "post-logout-redirect-uris" $redirectUris) -}}',
    '  {{- else }}',
    '    {{- toJson (dict "redirect-uris" $redirectUris) -}}',
    '  {{- end -}}',
    '{{- end }}',
    '\n',
    '{{- define "tenantHostPattern" -}}',
    '  {{- $domains := (include "domainHostMap" . | fromJson).domains -}}',
    '  {{- printf "^(.*)\\\\.(%s)" (join "|" $domains | replace "." "\\\\.") -}}',
    '{{- end }}'
  ])

  if (isConfigurableTemplateChart) {
    yaml.push([
      '\n',
      '{{- define "originalAppName" -}}',
      `{{ print "` + project.appName + `" }}`,
      '{{- end -}}'
    ])
  }

  return yaml.toString()
}

module.exports = {
  replacePlaceholders,
  mergeObj,
  isCAPOperatorChart,
  isConfigurableTemplateChart,
  isServiceOnlyChart,
  ask,
  setPromptFunction,
  transformValuesAndFillCapOpCroYaml,
  convertHypenNameToCamelcase,
  getServiceInstanceKeyName,
  getConfigurableCapOpCroYaml,
  getCAPOpCroYaml,
  getDomainCroYaml,
  getHelperTpl
}
