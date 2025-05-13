#!/usr/bin/env node
/* eslint-disable no-console */
/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const isCli = require.main === module
const cds = require('@sap/cds-dk')
const yaml = require('@sap/cds-foss').yaml
const Mustache = require('mustache')
const { spawn } = require('child_process')

const { ask, mergeObj, isCAPOperatorChart, isConfigurableTemplateChart, transformValuesAndFillCapOpCroYaml, isServiceOnlyChart } = require('../lib/util')

const SUPPORTED = { 'generate-runtime-values': ['--with-input-yaml'], 'convert-to-configurable-template-chart': ['--with-runtime-yaml'] }

async function capOperatorPlugin(cmd, option, yamlPath) {
    try {
        if (!cmd) return _usage()
        if (!Object.keys(SUPPORTED).includes(cmd)) return _usage(`Unknown command ${cmd}.`)
        if (option && !SUPPORTED[cmd].includes(option)) return _usage(`Invalid option ${option}.`)

        if (cmd === 'generate-runtime-values') {
            if (option === '--with-input-yaml' && !yamlPath)
                return _usage(`Input yaml path is missing.`)

            if (option === '--with-input-yaml' && !yamlPath && cds.utils.exists(cds.utils.path.join(cds.root,yamlPath)))
                return _usage(`Input yaml path ${yamlPath} does not exist.`)

            await generateRuntimeValues(option, yamlPath)
        }

        if (cmd === 'convert-to-configurable-template-chart') {
            if (option === '--with-runtime-yaml' && !yamlPath)
                return _usage(`Input runtime yaml path is missing.`)

            if (option === '--with-runtime-yaml' && !yamlPath && cds.utils.exists(cds.utils.path.join(cds.root,yamlPath)))
                return _usage(`Input runtime yaml path ${yamlPath} does not exist.`)

            await convertToconfigurableTemplateChart(option, yamlPath)
        }
    } catch (e) {
        if (isCli) {
            console.error(e.message)
            process.exit(1)
        } else throw e
    }
}

async function _handleError(message) {
    if (isCli) {
        console.error(message)
        process.exit(1)
    }
    throw new Error(message)
}

async function _usage(message = '') {
    return _handleError(message + `

USAGE

    cap-op-plugin <command>

COMMANDS

    generate-runtime-values [--with-input-yaml <input-yaml-path>]   Generate runtime-values.yaml file for the cap-operator chart

    convert-to-configurable-template-chart [--with-runtime-yaml <runtime-yaml-path>]  Convert existing chart to configurable template chart

EXAMPLES

    cap-op-plugin generate-runtime-values
    cap-op-plugin generate-runtime-values --with-input-yaml /path/to/input.yaml

    cap-op-plugin convert-to-configurable-template-chart
    cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml /path/to/runtime.yaml
`
    )
}

async function transformRuntimeValues(runtimeYamlPath) {
    console.log('Transforming runtime values file '+ cds.utils.path.join(cds.root,runtimeYamlPath) + ' to the configurable template chart format.')
    let runtimeYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, runtimeYamlPath)))
    if (runtimeYaml?.workloads?.server?.deploymentDefinition?.env) {
        const index = runtimeYaml.workloads.server.deploymentDefinition.env.findIndex(e => e.name === 'CDS_CONFIG')
        if (index > -1) {
            const cdsConfigValueJson = JSON.parse(runtimeYaml.workloads.server.deploymentDefinition.env[index].value)
            if (cdsConfigValueJson?.requires?.['cds.xt.DeploymentService']?.hdi?.create?.database_id){
                runtimeYaml['hanaInstanceId'] = cdsConfigValueJson.requires['cds.xt.DeploymentService'].hdi.create.database_id
                delete runtimeYaml['workloads']
                await cds.utils.write(yaml.stringify(runtimeYaml)).to(cds.utils.path.join(cds.root, runtimeYamlPath))
            }
        }
    }
}

async function isRuntimeValueAlreadyTransformed(runtimeYamlPath) {
    let runtimeYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, runtimeYamlPath)))
    return !!runtimeYaml['hanaInstanceId']
}

async function convertToconfigurableTemplateChart(option, runtimeYamlPath) {
    if (!((cds.utils.exists('chart') && isCAPOperatorChart(cds.utils.path.join(cds.root,'chart')))))
        throw new Error("No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.")

    if (isConfigurableTemplateChart(cds.utils.path.join(cds.root,'chart'))){
        console.log("Exisiting chart is already a configurable template chart. No need for conversion.")
        if (option === '--with-runtime-yaml' && runtimeYamlPath && !(await isRuntimeValueAlreadyTransformed(runtimeYamlPath)))
            await transformRuntimeValues(runtimeYamlPath)
        else
            console.log('Runtime values file '+ cds.utils.path.join(cds.root,runtimeYamlPath) + ' already in the configurable template chart format.')
        return
    }

    console.log('Converting chart '+cds.utils.path.join(cds.root,'chart')+' to configurable template chart.')

    // Copy templates
    await cds.utils.copy(cds.utils.path.join(__dirname, '../files/configurableTemplatesChart/templates/_helpers.tpl')).to(cds.utils.path.join(cds.root,'chart/templates/_helpers.tpl'))
    await cds.utils.copy(cds.utils.path.join(__dirname, '../files/commonTemplates/')).to(cds.utils.path.join(cds.root,'chart/templates/'))

    isServiceOnlyChart(cds.utils.path.join(cds.root,'chart')) ? await cds.utils.copy(cds.utils.path.join(__dirname, '../files/configurableTemplatesChart/templates/cap-operator-cros-svc.yaml')).to(cds.utils.path.join(cds.root,'chart/templates/cap-operator-cros.yaml')) :
        await cds.utils.copy(cds.utils.path.join(__dirname, '../files/configurableTemplatesChart/templates/cap-operator-cros.yaml')).to(cds.utils.path.join(cds.root,'chart/templates/cap-operator-cros.yaml'))

    // Copy values.schema.json
    await cds.utils.copy(cds.utils.path.join(__dirname, '../files/configurableTemplatesChart/values.schema.json')).to(cds.utils.path.join(cds.root,'chart', 'values.schema.json'))

    // Add annotation to chart.yaml
    const chartYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/Chart.yaml')))
    chartYaml['annotations']['app.kubernetes.io/part-of'] = 'cap-operator-configurable-templates'
    await cds.utils.write(yaml.stringify(chartYaml)).to(cds.utils.path.join(cds.root, 'chart/Chart.yaml'))

    // Transform
    await transformValuesAndFillCapOpCroYaml()

    if (option === '--with-runtime-yaml' && runtimeYamlPath) {
        await transformRuntimeValues(runtimeYamlPath)
    }
}

async function generateRuntimeValues(option, inputYamlPath) {
    if (!((cds.utils.exists('chart') && isCAPOperatorChart(cds.utils.path.join(cds.root,'chart'))))) {
        throw new Error("No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.")
    }

    let answerStruct = {}
    const { appName, appDescription } = getAppDetails()
    const isConfigurableTempChart = isConfigurableTemplateChart(cds.utils.path.join(cds.root,'chart'))
    const isServiceOnly = isServiceOnlyChart(cds.utils.path.join(cds.root,'chart'))

    if (option === '--with-input-yaml' && inputYamlPath) {

        answerStruct = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, inputYamlPath)))

        const requiredFields = isServiceOnly
            ? ['appName', 'capOperatorSubdomain', 'clusterDomain', 'globalAccountId']
            : ['appName', 'capOperatorSubdomain', 'clusterDomain', 'globalAccountId', 'providerSubdomain', 'tenantId']

        const missingFields = requiredFields.filter(field => !answerStruct[field])
        if (missingFields.length) {
            throw new Error(`Missing mandatory fields in the input yaml file: ${missingFields.join(', ')}`)
        }

    } else {
        const questions = [
            ['Enter app name for deployment: ', appName, true],
            ['Enter CAP Operator subdomain (In kyma cluster it is "cap-op" by default): ', 'cap-op', true],
            ['Enter your cluster shoot domain: ', await getShootDomain(), true],
            ['Enter your global account ID: ', '', true],
            ...isServiceOnly ? [] : [['Enter your provider subdomain: ', '', true]],
            ...isServiceOnly ? [] : [['Enter your provider tenant ID: ', '', true]],
            ['Enter your HANA database instance ID: ', '', false],
            ['Enter your image pull secrets: ', '', false]
        ]

        const answerKeys = [
            'appName', 'capOperatorSubdomain', 'clusterDomain', 'globalAccountId',
            ...isServiceOnly ? [] : ['providerSubdomain'],
            ...isServiceOnly ? [] : ['tenantId'],
            'hanaInstanceId', 'imagePullSecret'
        ]

        const answer = await ask(...questions)
        answerStruct = Object.fromEntries(answerKeys.map((key, index) => [key, answer[index]]))
    }

    answerStruct['appDescription'] = appDescription ?? answerStruct['appName']

    const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))

    //get saas-registry and xsuaa service keys
    answerStruct['saasRegistryKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'saas-registry') || 'saas-registry'
    answerStruct['xsuaaKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa') || 'xsuaa'

    answerStruct['isApp'] = !isServiceOnly
    answerStruct['isService'] = isServiceOnly
    let runtimeValuesYaml = yaml.parse(Mustache.render(await cds.utils.read(cds.utils.path.join(__dirname, '../files/runtime-values.yaml.hbs')), answerStruct))

    if (!answerStruct['imagePullSecret'])
        delete runtimeValuesYaml['imagePullSecrets']

    if (isConfigurableTempChart && answerStruct['hanaInstanceId'])
        runtimeValuesYaml['hanaInstanceId'] = answerStruct['hanaInstanceId']

    if (!isConfigurableTempChart)
        updateWorkloadEnv(runtimeValuesYaml, valuesYaml, answerStruct)

    await cds.utils.write(yaml.stringify(runtimeValuesYaml)).to(cds.utils.path.join(cds.root, 'chart/runtime-values.yaml'))
    console.log("Generated 'runtime-values.yaml' file in the 'chart' folder.")
}

function updateWorkloadEnv(runtimeValuesYaml, valuesYaml, answerStruct) {
    runtimeValuesYaml['workloads'] = {}
    for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {

        runtimeValuesYaml['workloads'][workloadKey] = workloadDetails.deploymentDefinition
            ? { "deploymentDefinition": { "env": workloadDetails.deploymentDefinition.env ?? [] } }
            : { "jobDefinition": { "env": workloadDetails.jobDefinition.env ?? [] } }

        const cdsConfigHana = Mustache.render('{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{hanaInstanceId}}"}}}}}', answerStruct)

        if ((workloadDetails?.deploymentDefinition?.type === 'CAP' || workloadDetails?.deploymentDefinition?.type === 'service') && answerStruct['hanaInstanceId']) {
            updateCdsConfigEnv(runtimeValuesYaml, workloadKey, 'deploymentDefinition', cdsConfigHana)
        }

        if (workloadDetails?.jobDefinition?.type === 'TenantOperation' && answerStruct['hanaInstanceId']) {
            updateCdsConfigEnv(runtimeValuesYaml, workloadKey, 'jobDefinition', cdsConfigHana)
        }

        if (workloadDetails?.deploymentDefinition?.type === 'Router') {
            const index = runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].findIndex(e => e.name === 'TENANT_HOST_PATTERN')
            if (index > -1)
                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index] = { name: 'TENANT_HOST_PATTERN', value: '^(.*).' + answerStruct["appName"] + '.' + answerStruct["clusterDomain"] }
            else
                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].push({ name: 'TENANT_HOST_PATTERN', value: '^(.*).' + answerStruct["appName"] + '.' + answerStruct["clusterDomain"] })
        }
    }

    // remove workload definition where env is empty
    for (const [workloadKey, workloadDetails] of Object.entries(runtimeValuesYaml.workloads)) {
        if (workloadDetails?.deploymentDefinition?.env.length === 0 || workloadDetails?.jobDefinition?.env.length === 0) {
            delete runtimeValuesYaml['workloads'][workloadKey]
        }
    }

    // if no workload definition is present, remove workloads key
    if (Object.keys(runtimeValuesYaml['workloads']).length === 0) {
        delete runtimeValuesYaml['workloads']
    }
}

function getServiceInstanceKeyName(serviceInstances, offeringName) {
    for (const key in serviceInstances) {
        if (serviceInstances[key].serviceOfferingName === offeringName)
            return key
    }
    return null
}

function updateCdsConfigEnv(runtimeValuesYaml, workloadKey, workloadDefintion, cdsConfigHana) {
    const index = runtimeValuesYaml['workloads'][workloadKey][workloadDefintion]['env'].findIndex(e => e.name === 'CDS_CONFIG')
    if (index > -1) {
        // Get existing CDS_CONFIG and merge with new CDS_CONFIG for HANA
        const existingCdsConfigJson = JSON.parse(runtimeValuesYaml['workloads'][workloadKey][workloadDefintion]['env'][index].value)
        const mergedCdsConfig = mergeObj(existingCdsConfigJson, JSON.parse(cdsConfigHana))

        runtimeValuesYaml['workloads'][workloadKey][workloadDefintion]['env'][index] = { name: 'CDS_CONFIG', value: JSON.stringify(mergedCdsConfig) }
    } else
        runtimeValuesYaml['workloads'][workloadKey][workloadDefintion]['env'].push({ name: 'CDS_CONFIG', value: cdsConfigHana })
}

function getAppDetails() {
    const { name, description } = JSON.parse(cds.utils.fs.readFileSync(cds.utils.path.join(cds.root, 'package.json')))
    const segments = (name ?? this.appName).trim().replace(/@/g, '').split('/').map(encodeURIComponent)
    return { appName: segments[segments.length - 1], appDescription: description }
}

async function getShootDomain() {
    let domain = ''
    try {
        const kubectl = spawn('kubectl', ['config', 'view', '--minify', '--output', 'jsonpath={.clusters[*].cluster.server}'], { shell: false })

        await new Promise((resolve, reject) => {
            kubectl.stdout.on('data', (data) => {
                const domainStartIndex = data.indexOf('api.')
                if (domainStartIndex !== -1) {
                    domain = data.toString().substring(domainStartIndex + 4)
                }
            })

            kubectl.stderr.on('data', () => { reject() })

            kubectl.on('close', () => { resolve() })
        })
    } catch (error) {}

    return domain
}

if (isCli) {
    const [, , cmd, option, yamlPath] = process.argv;
    (async () => await capOperatorPlugin(cmd, option, yamlPath ?? undefined))()
}

module.exports = { capOperatorPlugin }
