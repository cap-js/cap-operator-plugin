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
const https = require('https')
const zlib = require('zlib')

const {
    ask,
    mergeObj,
    isCAPOperatorChart,
    isConfigurableTemplateChart,
    transformValuesAndFillCapOpCroYaml,
    isServiceOnlyChart,
    getServiceInstanceKeyName,
    getConfigurableCapOpCroYaml,
    getDomainCroYaml,
    getHelperTpl
} = require('../lib/util')

const SUPPORTED = { 'generate-runtime-values': ['--with-input-yaml'], 'convert-to-configurable-template-chart': ['--with-runtime-yaml'], 'add-cap-operator-skill': ['--branch', '--version'] }

async function capOperatorPlugin(cmd, option, optionValue) {
    try {
        if (!cmd) return _usage()
        if (!Object.keys(SUPPORTED).includes(cmd)) return _usage(`Unknown command ${cmd}.`)
        if (option && !SUPPORTED[cmd].includes(option)) return _usage(`Invalid option ${option}.`)

        if (cmd === 'add-cap-operator-skill') {
            if (option === '--branch' && !optionValue) return _usage(`Branch name is missing.`)
            if (option === '--version' && !optionValue) return _usage(`Version is missing.`)
            await addCapOperatorSkill({ branch: option === '--branch' ? optionValue : undefined, version: option === '--version' ? optionValue : undefined })
            return
        }

        if (cmd === 'generate-runtime-values') {
            if (option === '--with-input-yaml' && !optionValue)
                return _usage(`Input yaml path is missing.`)

            if (option === '--with-input-yaml' && optionValue && !cds.utils.exists(cds.utils.path.join(cds.root, optionValue)))
                return _usage(`Input yaml path ${optionValue} does not exist.`)

            await generateRuntimeValues(option, optionValue)
        }

        if (cmd === 'convert-to-configurable-template-chart') {
            if (option === '--with-runtime-yaml' && !optionValue)
                return _usage(`Input runtime yaml path is missing.`)

            if (option === '--with-runtime-yaml' && optionValue && !cds.utils.exists(cds.utils.path.join(cds.root, optionValue)))
                return _usage(`Input runtime yaml path ${optionValue} does not exist.`)

            await convertToconfigurableTemplateChart(option, optionValue)
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

    add-cap-operator-skill [--branch <branch-name> | --version <release-version>]   Add the CAP Operator agent skill to the .agents/skills/cap-operator folder

EXAMPLES

    cap-op-plugin generate-runtime-values
    cap-op-plugin generate-runtime-values --with-input-yaml /path/to/input.yaml

    cap-op-plugin convert-to-configurable-template-chart
    cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml /path/to/runtime.yaml

    cap-op-plugin add-cap-operator-skill
    cap-op-plugin add-cap-operator-skill --branch main
    cap-op-plugin add-cap-operator-skill --version v0.33.0
`
    )
}

async function transformRuntimeValues(runtimeYamlPath) {
    console.log('Transforming runtime values file ' + cds.utils.path.join(cds.root, runtimeYamlPath) + ' to the configurable template chart format.')
    let runtimeYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, runtimeYamlPath)))
    if (runtimeYaml?.workloads?.server?.deploymentDefinition?.env) {
        const index = runtimeYaml.workloads.server.deploymentDefinition.env.findIndex(e => e.name === 'CDS_CONFIG')
        if (index > -1) {
            const cdsConfigValueJson = JSON.parse(runtimeYaml.workloads.server.deploymentDefinition.env[index].value)
            if (cdsConfigValueJson?.requires?.['cds.xt.DeploymentService']?.hdi?.create?.database_id) {
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
    if (!((cds.utils.exists('chart') && isCAPOperatorChart(cds.utils.path.join(cds.root, 'chart')))))
        throw new Error("No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.")

    if (isConfigurableTemplateChart(cds.utils.path.join(cds.root, 'chart'))) {
        console.log("Exisiting chart is already a configurable template chart. No need for conversion.")
        if (option === '--with-runtime-yaml' && runtimeYamlPath && !(await isRuntimeValueAlreadyTransformed(runtimeYamlPath)))
            await transformRuntimeValues(runtimeYamlPath)
        else
            console.log('Runtime values file ' + cds.utils.path.join(cds.root, runtimeYamlPath) + ' already in the configurable template chart format.')
        return
    }

    console.log('Converting chart ' + cds.utils.path.join(cds.root, 'chart') + ' to configurable template chart.')

    // Copy templates
    await cds.utils.copy(cds.utils.path.join(__dirname, '../files/commonTemplates/')).to(cds.utils.path.join(cds.root, 'chart/templates/'))

    const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))
    const hasIas = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'identity') != null
    const hasXsuaa = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa') != null

    // Create _helpers.tpl
    await cds.utils.write(getHelperTpl({
        hasXsuaa: hasXsuaa
    }, false)).to(cds.utils.path.join(cds.root, 'chart/templates/_helpers.tpl'))

    // Create domain.yaml
    await cds.utils.write(getDomainCroYaml({
        hasIas: hasIas
    })).to(cds.utils.path.join(cds.root, 'chart/templates/domain.yaml'))

    // Create cap-operator-cros.yaml
    // Only filling those fields in the project input struct that are required to create CAPApplication CR
    // Workloads will be filled during transformValuesAndFillCapOpCroYaml function call
    await cds.utils.write(getConfigurableCapOpCroYaml({
        hasXsuaa: hasXsuaa,
        hasIas: hasIas,
        isService: isServiceOnlyChart(cds.utils.path.join(cds.root, 'chart'))
    })).to(cds.utils.path.join(cds.root, 'chart/templates/cap-operator-cros.yaml'))

    // Copy values.schema.json
    await cds.utils.copy(cds.utils.path.join(__dirname, '../files/configurableTemplatesChart/values.schema.json')).to(cds.utils.path.join(cds.root, 'chart', 'values.schema.json'))

    // Add annotation to chart.yaml
    const chartYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/Chart.yaml')))
    chartYaml['annotations']['app.kubernetes.io/part-of'] = 'cap-operator-configurable-templates'
    await cds.utils.write(yaml.stringify(chartYaml)).to(cds.utils.path.join(cds.root, 'chart/Chart.yaml'))

    // Transform CAPApplicationVersion CR from values.yaml
    await transformValuesAndFillCapOpCroYaml()

    if (option === '--with-runtime-yaml' && runtimeYamlPath) {
        await transformRuntimeValues(runtimeYamlPath)
    }
}

async function generateRuntimeValues(option, inputYamlPath) {
    if (!((cds.utils.exists('chart') && isCAPOperatorChart(cds.utils.path.join(cds.root, 'chart'))))) {
        throw new Error("No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.")
    }

    let answerStruct = {}
    const { appName, appDescription } = getAppDetails()
    const isConfigurableTempChart = isConfigurableTemplateChart(cds.utils.path.join(cds.root, 'chart'))
    const isServiceOnly = isServiceOnlyChart(cds.utils.path.join(cds.root, 'chart'))

    if (option === '--with-input-yaml' && inputYamlPath) {

        answerStruct = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, inputYamlPath)))

        const requiredFields = ['appName', 'capOperatorSubdomain', 'clusterDomain', 'providerSubaccountId']

        const missingFields = requiredFields.filter(field => !answerStruct[field]?.trim())
        if (missingFields.length) {
            throw new Error(`Missing mandatory fields in the input yaml file: ${missingFields.join(', ')}`)
        }

        if (!isServiceOnly && !/^[a-z0-9-]+$/.test(answerStruct['appName']?.trim())) {
            throw new Error(`Invalid app name '${answerStruct['appName']}': only a-z, 0-9 and - are allowed`)
        }

    } else {
        const appNameValidator = !isServiceOnly ? (value) => /^[a-z0-9-]+$/.test(value?.trim()) || 'Only a-z, 0-9 and - are allowed' : undefined
        const questions = [
            ['Enter app name for deployment', appName, true, appNameValidator],
            ['Enter CAP Operator subdomain (In kyma cluster it is "cap-op" by default)', 'cap-op', true],
            ['Enter your cluster shoot domain', await getShootDomain(), true],
            ['Enter your provider sub-account ID', '', true],
            ['Enter your HANA database instance ID', '', false],
            ['Enter your image pull secrets:', '', false]
        ]

        const answerKeys = [
            'appName', 'capOperatorSubdomain', 'clusterDomain', 'providerSubaccountId',
            'hanaInstanceId', 'imagePullSecret'
        ]

        const answer = await ask(...questions)
        answerStruct = Object.fromEntries(answerKeys.map((key, index) => [key, answer[index]]))
    }

    answerStruct['appDescription'] = appDescription ?? answerStruct['appName']

    const valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))

    //get saas-registry and xsuaa service keys
    const xsuaaServiceInstanceKey = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa')
    if (xsuaaServiceInstanceKey == null) {
        answerStruct['hasXsuaa'] = false
        answerStruct['subscriptionManagerKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'subscription-manager') || 'subscription-manager'
        answerStruct['identityKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'identity') || 'identity'
    } else {
        answerStruct['hasXsuaa'] = true
        answerStruct['saasRegistryKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'saas-registry') || 'saas-registry'
        answerStruct['xsuaaKeyName'] = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa') || 'xsuaa'
    }

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
    if (!answerStruct?.hanaInstanceId) return

    runtimeValuesYaml['workloads'] = {}
    for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {

        const cdsConfigHana = Mustache.render('{"requires":{"cds.xt.DeploymentService":{"hdi":{"create":{"database_id":"{{hanaInstanceId}}"}}}}}', answerStruct)

        if ((workloadDetails?.deploymentDefinition?.type === 'CAP' || workloadDetails?.deploymentDefinition?.type === 'Service')) {
            runtimeValuesYaml['workloads'][workloadKey] = { "deploymentDefinition": { "env": workloadDetails.deploymentDefinition.env ?? [] }}
            updateCdsConfigEnv(runtimeValuesYaml, workloadKey, 'deploymentDefinition', cdsConfigHana)
        }

        if (workloadDetails?.jobDefinition?.type === 'TenantOperation') {
            runtimeValuesYaml['workloads'][workloadKey] = { "jobDefinition": { "env": workloadDetails.jobDefinition.env ?? [] } }
            updateCdsConfigEnv(runtimeValuesYaml, workloadKey, 'jobDefinition', cdsConfigHana)
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

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'cap-operator-plugin' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(httpsGetJson(res.headers.location))
                return
            }
            if (res.statusCode !== 200) {
                res.resume()
                reject(new Error(`HTTP ${res.statusCode} for ${url}`))
                return
            }
            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())))
        })
        req.on('error', reject)
    })
}

function streamTarball(url, onEntry) {
    return new Promise((resolve, reject) => {
        const follow = (target) => {
            https.get(target, { headers: { 'User-Agent': 'cap-operator-plugin' } }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume()
                    follow(res.headers.location)
                    return
                }
                if (res.statusCode !== 200) {
                    res.resume()
                    reject(new Error(`HTTP ${res.statusCode} downloading tarball`))
                    return
                }
                const entries = []
                let buf = Buffer.alloc(0)

                const gunzip = zlib.createGunzip()
                gunzip.on('error', reject)

                // Minimal tar parser: each 512-byte header block followed by content blocks
                gunzip.on('data', chunk => {
                    buf = Buffer.concat([buf, chunk])
                    while (buf.length >= 512) {
                        const nameRaw = buf.slice(0, 100).toString('utf8').replace(/\0/g, '')
                        if (!nameRaw) { buf = buf.slice(512); continue }

                        const sizeOctal = buf.slice(124, 136).toString('utf8').replace(/\0/g, '').trim()
                        const size = parseInt(sizeOctal, 8) || 0
                        const typeFlag = buf.slice(156, 157).toString('utf8').replace(/\0/g, '')
                        const blocks = Math.ceil(size / 512)
                        const total = 512 + blocks * 512

                        if (buf.length < total) break

                        if (typeFlag === '0' || typeFlag === '') {
                            // strip leading top-level directory (e.g. "cap-operator-v0.33.0/")
                            const pathInTar = nameRaw.replace(/^[^/]+\//, '')
                            const content = buf.slice(512, 512 + size)
                            entries.push(onEntry(pathInTar, content))
                        }

                        buf = buf.slice(total)
                    }
                })

                gunzip.on('end', () => resolve(Promise.all(entries)))
                res.pipe(gunzip)
            }).on('error', reject)
        }
        follow(url)
    })
}

async function addCapOperatorSkill({ branch, version } = {}) {
    const REPO = 'SAP/cap-operator'
    const AGENTS_FOLDER = '.agents'

    let ref, tarballUrl
    if (branch) {
        ref = branch
        tarballUrl = `https://github.com/${REPO}/archive/refs/heads/${branch}.tar.gz`
    } else {
        const tag = version ?? (await httpsGetJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name
        ref = tag
        tarballUrl = `https://github.com/${REPO}/archive/refs/tags/${tag}.tar.gz`
    }

    const agentFiles = []
    await streamTarball(tarballUrl, (pathInTar, content) => {
        if (pathInTar.startsWith(`${AGENTS_FOLDER}/`))
            agentFiles.push({ path: pathInTar, content: Buffer.from(content) })
    })

    if (!agentFiles.length)
        throw new Error(`No .agents folder found in cap-operator ${ref}.`)

    const skillDirs = new Set()
    for (const { path: p } of agentFiles) {
        const match = p.match(/^\.agents\/skills\/[^/]+/)
        if (match) skillDirs.add(match[0])
    }
    for (const dir of skillDirs) {
        const abs = cds.utils.path.join(cds.root, dir)
        if (cds.utils.exists(abs)) await cds.utils.rimraf(abs)
    }

    for (const { path: p, content } of agentFiles) {
        await cds.utils.write(content).to(cds.utils.path.join(cds.root, p))
    }

    console.log(`Added CAP Operator agent skills (${ref}) to '${AGENTS_FOLDER}'.`)
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

            kubectl.on('error', () => { reject() })

            kubectl.on('close', () => { resolve() })
        })
    } catch (error) { }

    return domain
}

if (isCli) {
    const [, , cmd, option, optionValue] = process.argv;
    (async () => await capOperatorPlugin(cmd, option, optionValue ?? undefined))()
}

module.exports = { capOperatorPlugin }
