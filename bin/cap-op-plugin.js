#!/usr/bin/env node
/* eslint-disable no-console */

const cds = require('@sap/cds-dk')
const yaml = require('@sap/cds-foss').yaml
const Mustache = require('mustache')
const { ask, mergeObj, isCAPOperatorChart } = require('../lib/util')

const isCli = require.main === module
const SUPPORTED = {'generate-runtime-values': ['--via-prompts', '--via-input-yaml']}

async function capOperatorPlugin(cmd, option, inputYamlPath) {

    try {
        if (!cmd) return _usage()
        if (!Object.keys(SUPPORTED).includes(cmd)) return _usage(`Unknown command ${cmd}.`)
        if (option && !SUPPORTED[cmd].includes(option)) return _usage(`Invalid option ${option}.`)
        if (option === '--via-input-yaml' && !inputYamlPath) return _usage(`Input yaml path is missing.`)

        if (cmd === 'generate-runtime-values') await generateRuntimeValues(option, inputYamlPath)
    } catch(e) {
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

    cap-op-plugin <command> [--via-prompts, --via-input-yaml <input-yaml-path>]

COMMANDS

    generate-runtime-values   generate runtime-values.yaml file for the cap-operator chart

EXAMPLES

    cap-op-plugin generate-runtime-values --via-prompts
    cap-op-plugin generate-runtime-values --via-input-yaml /path/to/input.yaml
`
    )
}

async function generateRuntimeValues(option, inputYamlPath) {

    if (!((cds.utils.exists('chart') && isCAPOperatorChart('chart')))) {
        throw new Error("No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.")
    }

    let answerStruct = {}
    const { appName, appDescription } = getAppDetails()

    if(option === '--via-input-yaml' && inputYamlPath) {

        answerStruct = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, inputYamlPath)))

        if (!answerStruct['appName'] || !answerStruct['capOperatorSubdomain'] || !answerStruct['clusterDomain'] || !answerStruct['globalAccountId'] || !answerStruct['providerSubdomain'] || !answerStruct['tenantId'])
            throw new Error(`'appName', 'capOperatorSubdomain', 'clusterDomain', 'globalAccountId', 'providerSubdomain' and 'tenantId' are mandatory fields in the input yaml file.`)

    } else {
        const questions = [
            ['Enter app name for deployment: ', appName, true],
            ['Enter CAP Operator subdomain (In kyma cluster it is "cap-op" by default): ', 'cap-op', true],
            ['Enter your cluster shoot domain: ','', true],
            ['Enter your global account ID: ','', true],
            ['Enter your provider subdomain: ','', true],
            ['Enter your provider tenant ID: ','', true],
            ['Enter your HANA database instance ID: ','', false],
            ['Enter your image pull secrets: ','', false]
        ]

        const answerKeys = [
            'appName', 'capOperatorSubdomain', 'clusterDomain',
            'globalAccountId', 'providerSubdomain', 'tenantId',
            'hanaInstanceId', 'imagePullSecret'
        ]

        const answer = await ask(...questions)
        answerStruct = Object.fromEntries(answerKeys.map((key, index) => [key, answer[index]]))
    }

    answerStruct['appDescription'] = appDescription ?? answerStruct['appName']

    const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))

    const runtimeValuesYaml =  yaml.parse(Mustache.render( await cds.utils.read(cds.utils.path.join(__dirname, '../files/runtime-values.yaml.hbs')), answerStruct))

    if(!answerStruct['imagePullSecret'])
        delete runtimeValuesYaml['imagePullSecrets']

    runtimeValuesYaml['workloads'] = {}
    for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {
        if (workloadDetails.deploymentDefinition)
            runtimeValuesYaml['workloads'][workloadKey] = { "deploymentDefinition": {"env": workloadDetails.deploymentDefinition.env ?? [] }}
        else if (workloadDetails.jobDefinition)
            runtimeValuesYaml['workloads'][workloadKey] = { "jobDefinition": {"env": workloadDetails.jobDefinition.env ?? [] }}

        const cdsConfigHana = Mustache.render('{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{hanaInstanceId}}"}}}}}', answerStruct)

        if (workloadDetails.deploymentDefinition && workloadDetails.deploymentDefinition.type === 'CAP' && answerStruct['hanaInstanceId']) {
            const index = runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].findIndex(e => e.name === 'CDS_CONFIG')
            if (index > -1) {
                // Get existing CDS_CONFIG and merge with new CDS_CONFIG for HANA
                const existingCdsConfigJson = JSON.parse(runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index].value)
                const mergedCdsConfig = mergeObj(existingCdsConfigJson, JSON.parse(cdsConfigHana))

                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index] = {name: 'CDS_CONFIG', value: JSON.stringify(mergedCdsConfig) }
            } else
                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].push({name: 'CDS_CONFIG', value: cdsConfigHana })
        }

        if (workloadDetails.jobDefinition && workloadDetails.jobDefinition.type === 'TenantOperation' && answerStruct['hanaInstanceId']) {
            const index = runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'].findIndex(e => e.name === 'CDS_CONFIG')
            if (index > -1) {
                // Get existing CDS_CONFIG and merge with new CDS_CONFIG for HANA
                const existingCdsConfigJson = JSON.parse(runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'][index].value)
                const mergedCdsConfig = mergeObj(existingCdsConfigJson, JSON.parse(cdsConfigHana))

                runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'][index] = {name: 'CDS_CONFIG', value: JSON.stringify(mergedCdsConfig)}
            } else
                runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'].push({name: 'CDS_CONFIG', value: cdsConfigHana })
        }

        if (workloadDetails.deploymentDefinition && workloadDetails.deploymentDefinition.type === 'Router') {
            const index = runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].findIndex(e => e.name === 'TENANT_HOST_PATTERN')
            if (index > -1)
                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index] = {name: 'TENANT_HOST_PATTERN', value: '^(.*).'+ answerStruct["appName"] + '.' + answerStruct["clusterDomain"]}
            else
                runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].push({name: 'TENANT_HOST_PATTERN', value: '^(.*).'+ answerStruct["appName"] + '.' + answerStruct["clusterDomain"]})
        }
    }

    // remove workload definition where env is empty
    for (const [workloadKey, workloadDetails] of Object.entries(runtimeValuesYaml.workloads)) {
        if (workloadDetails.deploymentDefinition && workloadDetails.deploymentDefinition.env && workloadDetails.deploymentDefinition.env.length === 0) {
            delete runtimeValuesYaml['workloads'][workloadKey]
        }

        if (workloadDetails.jobDefinition && workloadDetails.jobDefinition.env && workloadDetails.jobDefinition.env.length === 0) {
            delete runtimeValuesYaml['workloads'][workloadKey]
        }
    }

    await cds.utils.write(yaml.stringify(runtimeValuesYaml)).to(cds.utils.path.join(cds.root, 'chart/runtime-values.yaml'))
    console.log("Generated 'runtime-values.yaml' file in the 'chart' folder.")
}

function getAppDetails() {
    const { name, description } = JSON.parse(cds.utils.fs.readFileSync(cds.utils.path.join(cds.root, 'package.json')))
    const segments = (name ?? this.appName).trim().replace(/@/g, '').split('/').map(encodeURIComponent)
    return { appName: segments[segments.length - 1], appDescription: description }
}

if (isCli) {
    const [, , cmd, option, inputYamlPath ] = process.argv
    ;(async () => await capOperatorPlugin(cmd, option, inputYamlPath ?? undefined))()
}

module.exports = { capOperatorPlugin }
