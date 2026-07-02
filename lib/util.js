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

async function ask(...args) {
  const questions = args.map(([message, initial, mandatory, validator], index) => {
    const validate = (mandatory || validator) ? (value) => {
      if (mandatory && !value?.trim()) return 'This field is required'
      if (validator && value?.trim()) return validator(value?.trim())
      return true
    } : undefined
    return {
      type: 'input',
      name: String(index),
      message: mandatory ? `${message} *` : message,
      initial: initial || '',
      required: mandatory && !initial,
      validate,
      separator: ''
    }
  })

  const promptFn = enquirer.prompt.bind(enquirer)
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
    console.warn(`Failed to parse CDS_CONFIG: ${err.message}`)
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

async function getProjectFromValuesYaml(chartPath) {
  const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(chartPath, 'values.yaml')))
  const chartYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(chartPath, 'Chart.yaml')))
  const si = valuesYaml['serviceInstances']
  const has = offering => getServiceInstanceKeyName(si, offering) != null
  return {
    isService: chartYaml.annotations?.["app.kubernetes.io/component"] === 'service-only' || false,
    appName: chartYaml.name,
    hasXsuaa: has('xsuaa'),
    hasIas: has('identity'),
    hasDestination: has('destination'),
    hasHtml5Repo: has('html5-apps-repo'),
    hasMultitenancy: has('saas-registry') || has('subscription-manager'),
    hasApprouter: valuesYaml.workloads?.appRouter != null,
    hasAms: valuesYaml.workloads?.amsDeployer != null,
  }
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
    yaml.block(['annotations:'], () => {
      yaml.push('sme.sap.com/enable-cleanup-monitoring: "{{ .Values.app.enableCleanupMonitoring }}"')
    })
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
      'providerSubaccountId: {{ .Values.btp.providerSubaccountId }}',
      '{{- if .Values.app.rolloutOnCredentialUpdate }}',
      'rolloutOnCredentialUpdate: {{ .Values.app.rolloutOnCredentialUpdate }}',
      '{{- end }}'
    ])

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
        '  {{- if hasKey $serviceInstance "subscriptionDependency" }}',
        '  subscriptionDependency: {{ get $serviceInstance "subscriptionDependency" }}',
        '  {{- end }}',
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
    '  version: "{{ .Values.app.version | default .Release.Revision }}"',
    '  {{- if .Values.imagePullSecrets }}',
    '  registrySecrets:',
    '  {{- range .Values.imagePullSecrets }}',
    '  - {{ . }}',
    '  {{- end }}',
    '  {{- else }}',
    '  registrySecrets: []',
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
            `ttlSecondsAfterFinished: 300`,
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
          'image: {{ .Values.workloads.contentDeploy.image }}',
          'ttlSecondsAfterFinished: 300'
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
            'image: {{ .Values.workloads.amsDeployer.image }}',
            'ttlSecondsAfterFinished: 300'
          ])
        })
      })
  }

  yaml.dec() // unindent workloads

  // -- Content Jobs ---
  if (hasAms) {
    yaml.block(['  contentJobs:'], () => {
      yaml.push([
        '- content-deploy',
        '- ams-deployer'
      ])
    })
  }

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
      '  {{- $jobDef := merge $v.jobDefinition (dict "ttlSecondsAfterFinished" 300) }}',
      '  jobDefinition: {{- toYaml $jobDef | trim | nindent 6 }}',
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
  yaml.push([
    '\n',
    '  {{- if .Values.serviceExposures }}',
    '  serviceExposures: {{- toYaml .Values.serviceExposures | trim | nindent 4 }}',
    '  {{- end }}'
  ])

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
      'tlsMode: Simple',
    ])
  })

  return yaml.toString()
}

function getHelperTpl(project, isConfigurableTemplateChart) {
  const yaml = yamlBuilder()
  const { hasXsuaa } = project

  yaml.push([
    '{{- define "capApplicationVersionName" -}}',
    '{{ printf "%s-%v" (include "appName" $) (.Values.app.version | default .Release.Revision) }}',
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
  transformValuesAndFillCapOpCroYaml,
  convertHypenNameToCamelcase,
  getServiceInstanceKeyName,
  getProjectFromValuesYaml,
  getConfigurableCapOpCroYaml,
  getCAPOpCroYaml,
  getDomainCroYaml,
  getHelperTpl
}
