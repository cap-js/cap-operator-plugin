/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const yaml = require('@sap/cds-foss').yaml
const readline = require('readline')
const fs = require('fs')

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
    const answers = []
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    function askQuestion(question, suggestion, mandatory) {
        return new Promise((resolve) => {
            const prompt = suggestion ? `${question} [${suggestion}] ` : `${question} `
            console.log()
            rl.question(prompt, (answer) => {
                const trimmedAnswer = answer.trim()
                if (mandatory && !trimmedAnswer && !suggestion) {
                    // If the question is mandatory and no answer is provided, re-ask the question
                    console.error('\nThis question is mandatory. Please provide an answer.')
                    resolve(askQuestion(question, suggestion, mandatory))
                } else {
                    answers.push(trimmedAnswer || suggestion || '')
                    resolve()
                }
            })
        })
    }

    for (const [question, suggestion, mandatory] of args) {
        await askQuestion(question, suggestion, mandatory)
    }

    rl.close()
    return answers
}

function injectTemplateFunction(templateFilePath, newFunctionCode) {
    fs.readFile(templateFilePath, 'utf8', (err, data) => {
        if (err)
            throw new Error(`Error reading the file: ${err}; _helper.tpl modification failed`)

        // Append the new function to the content
        const updatedContent = data + '\n' + newFunctionCode + '\n'

        fs.writeFile(templateFilePath, updatedContent, 'utf8', (err) => {
            if (err)
                throw new Error(`Error writing to the file: ${err}; _helper.tpl modification failed`)
        })
    })
}

async function transformValuesAndFillCapOpCroYaml() {
    let valuesYaml = yaml.parse(await cds.utils.read(cds.utils.path.join(cds.root, 'chart/values.yaml')))
    const capOpCROYaml = cds.utils.fs.readFileSync(cds.utils.path.join(cds.root, 'chart/templates/cap-operator-cros.yaml'), 'utf8')

    // Update cap-operator-cro.yaml with existing values
    let workloadArray = []
    let newWorkloadObj = {}
    let tenantHostPattern = { name: 'TENANT_HOST_PATTERN', value: '{{ include "tenantHostPattern" . }}' }
    for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {
        if (workloadDetails?.deploymentDefinition?.type === 'Router') {
            if (!workloadDetails.deploymentDefinition.env) {
                workloadDetails.deploymentDefinition.env = [tenantHostPattern]
            } else if (!workloadDetails.deploymentDefinition.env.some(e => e.name === tenantHostPattern.name)) {
                workloadDetails.deploymentDefinition.env.push(tenantHostPattern)
            }
        } else if ((workloadDetails?.deploymentDefinition?.type === 'CAP' || workloadDetails?.deploymentDefinition?.type === 'service') && workloadDetails.deploymentDefinition.env) {
            const index = workloadDetails.deploymentDefinition.env.findIndex(e => e.name === 'CDS_CONFIG')
            if (index > -1) {
                const cdsConfigValueJson = JSON.parse(workloadDetails.deploymentDefinition.env[index].value)
                if (cdsConfigValueJson?.requires?.['cds.xt.DeploymentService']?.hdi?.create?.database_id) {
                    valuesYaml['hanaInstanceId'] = cdsConfigValueJson.requires['cds.xt.DeploymentService'].hdi.create.database_id
                    cdsConfigValueJson.requires['cds.xt.DeploymentService'].hdi.create.database_id = '{{.Values.hanaInstanceId}}'
                    workloadDetails.deploymentDefinition.env[index].value = JSON.stringify(cdsConfigValueJson)
                }
            }
        } else if (workloadDetails?.jobDefinition?.type === 'TenantOperation' && workloadDetails.jobDefinition.env) {
            const index = workloadDetails.jobDefinition.env.findIndex(e => e.name === 'CDS_CONFIG')
            if (index > -1) {
                const cdsConfigValueJson = JSON.parse(workloadDetails.jobDefinition.env[index].value)
                if (cdsConfigValueJson?.requires?.['cds.xt.DeploymentService']?.hdi?.create?.database_id) {
                    valuesYaml['hanaInstanceId'] = cdsConfigValueJson.requires['cds.xt.DeploymentService'].hdi.create.database_id
                    cdsConfigValueJson.requires['cds.xt.DeploymentService'].hdi.create.database_id = '{{.Values.hanaInstanceId}}'
                    workloadDetails.jobDefinition.env[index].value = JSON.stringify(cdsConfigValueJson)
                }
            }
        }

        let workloadKeyCamelCase = convertHypenNameToCamelcase(workloadKey)
        if (workloadDetails.deploymentDefinition) {
            newWorkloadObj[workloadKeyCamelCase] = { "image": workloadDetails.deploymentDefinition.image }
            workloadDetails.deploymentDefinition.image = '{{.Values.workloads.' + workloadKeyCamelCase + '.image}}'
        } else {
            newWorkloadObj[workloadKeyCamelCase] = { "image": workloadDetails.jobDefinition.image }
            workloadDetails.jobDefinition.image = '{{.Values.workloads.' + workloadKeyCamelCase + '.image}}'
        }

        workloadArray.push(workloadDetails)
    }

    let updatedCapOpCROYaml = capOpCROYaml.replace(
        /workloads:\n(.*\n)*?(?=\n\s{2,}- name|spec:|$)/gm,
        yaml.stringify({ 'workloads': workloadArray }, { indent: 2 })
    )

    if (valuesYaml['tenantOperations']) {
        updatedCapOpCROYaml = updatedCapOpCROYaml.replace(
            /spec:\n((?:.*\n)*?)(\n[^ ]|$)/gm,
            (match, p1, p2) => `spec:\n${p1}  ${yaml.stringify({ 'tenantOperations': valuesYaml['tenantOperations'] }, { indent: 4 })}${p2}`
        )
        delete valuesYaml['tenantOperations']
    }

    if (valuesYaml['contentJobs']) {
        updatedCapOpCROYaml = updatedCapOpCROYaml.replace(
            /spec:\n((?:.*\n)*?)(\n[^ ]|$)/gm,
            (match, p1, p2) => `spec:\n${p1}  ${yaml.stringify({ 'contentJobs': valuesYaml['contentJobs'] }, { indent: 2 })}${p2}`
        )
        delete valuesYaml['contentJobs']
    }

    if (valuesYaml['serviceExposures']) {
        updatedCapOpCROYaml = updatedCapOpCROYaml.replace(
            /spec:\n((?:.*\n)*?)(\n[^ ]|$)/gm,
            (match, p1, p2) => `spec:\n${p1}  ${yaml.stringify({ 'serviceExposures': valuesYaml['serviceExposures'] }, { indent: 2 })}${p2}`
        )
        delete valuesYaml['serviceExposures']
    }

    cds.utils.fs.writeFileSync(cds.utils.path.join(cds.root, 'chart/templates/cap-operator-cros.yaml'), updatedCapOpCROYaml)

    valuesYaml['workloads'] = newWorkloadObj
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

module.exports = { replacePlaceholders, mergeObj, isCAPOperatorChart, isConfigurableTemplateChart, isServiceOnlyChart, ask, injectTemplateFunction, transformValuesAndFillCapOpCroYaml, convertHypenNameToCamelcase }
