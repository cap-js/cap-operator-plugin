/*
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const { copy, rimraf, exists, path, read, write } = cds.utils
const { join } = path
const yaml = require('@sap/cds-foss').yaml
const md5 = data => require('crypto').createHash('md5').update(data).digest('hex');

const MtaTransformer = require('./mta-transformer')
const { isCAPOperatorChart, ask } = require('./util')

const Mustache = require('mustache')

module.exports = class CapOperatorAddPlugin extends cds.add.Plugin {

    options() {
        return {
            'with-templates': {
                type: 'boolean',
                help: 'To add the templates folder to the chart folder.'
            },
            'with-mta': {
                type: 'string',
                //help: 'Path to the mta.yaml file.'
            },
            'with-mta-extensions': {
                type: 'string',
                //help: 'Comma separated list of mta extensions to be applied to the mta.yaml file. Can be used only with --with-mta option.'
            },
            'generate-runtime-values-via-prompts': {
                type: 'boolean',
                help: 'Generate runtime values file for the chart via prompts'
            },
            'generate-runtime-values-via-input-yaml': {
                type: 'string',
                help: 'Generate runtime values file for the chart via input yaml'
            },
        }
    }

    async canRun() {
        const { hasMultitenancy, hasApprouter, hasXsuaa } = cds.add.readProject()
        if (!hasXsuaa) {
            console.log(`❌  xsuaa is not added to this project. Run 'cds add xsuaa'.`)
            return false
        } else if (!hasApprouter && !exists('approuter')) {
            console.log(`❌  approuter is not added to this project. Run 'cds add approuter'.`)
            return false
        } else if (!hasMultitenancy) {
            console.log(`❌  multitenancy is not added to this project. Run 'cds add multitenancy'.`)
            return false
        }
        return true
    }

    static hasInProduction() {
        return !!(exists('chart') && isCAPOperatorChart('chart'))
    }

    async updateValuesYaml(updatedValues) {
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))
        for (const [key, value] of updatedValues.entries()) {
            valuesYaml[key] = value
        }
        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }

    async run() {
        if (cds.cli.options.force) await rimraf('chart')
        else if (exists('chart')) {
            let isCAPOpChart = isCAPOperatorChart('chart')

            if(isCAPOpChart && !exists('chart/templates') && cds.cli.options['with-templates']){
                await copy(join(__dirname, '../files/chart/templates')).to('chart/templates')
                console.log("Added 'templates' folder to the 'chart' folder.")
            }

            if (!isCAPOpChart) {
                throw new Error(`Existing 'chart' folder is not a CAP Operator helm chart. Run 'cds add cap-operator --force' to overwrite.`)
            } else if (isCAPOpChart && md5(JSON.stringify(await read('chart/values.schema.json'))) != md5(JSON.stringify(await read(join(__dirname, '../files/chart/values.schema.json'))))) {
                console.log("⚠️  'values.schema.json' file is outdated. Run with '--force' to overwrite the file and accept the new changes.")
            }

            if (cds.cli.options['generate-runtime-values-via-prompts'] || cds.cli.options['generate-runtime-values-via-input-yaml'])
                await this.generateRuntimeValues()
            return
        }

        const project = cds.add.readProject()
        await cds.add.merge(__dirname, '../files/chart/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
        await copy(join(__dirname, '../files/chart/values.yaml')).to('chart/values.yaml')
        await copy(join(__dirname, '../files/chart/values.schema.json')).to('chart/values.schema.json')

        if (cds.cli.options['with-templates'])
            await copy(join(__dirname, '../files/chart/templates')).to('chart/templates')

        console.log("`chart` folder generated.")

        if (!cds.cli.options['with-mta'] && cds.cli.options['with-mta-extensions'])
            throw new Error(`mta YAML not provided. Please pass the mta YAML via option '--with-mta'.`)

        if (cds.cli.options['with-mta']) {
            const { hasMta } = project
            if (!hasMta) throw new Error(`mta is not added to this project. Run 'cds add mta'.`)

            const mtaTransformer = new MtaTransformer(cds.cli.options['with-mta'], cds.cli.options['with-mta-extensions'] ? cds.cli.options['with-mta-extensions'].split(',') : [])

            console.log("⚠️  Deriving values.yaml from mta.yaml cannot be done one to one. It's a best guess, so some information might be missing and needs to be reviewed and corrected by the application developer.")

            let updateValuesMap = new Map()
            updateValuesMap.set('serviceInstances', await mtaTransformer.getServiceInstances())
            updateValuesMap.set('serviceBindings', await mtaTransformer.getServiceBindings())
            updateValuesMap.set('workloads', await mtaTransformer.getWorkloads())
            await this.updateValuesYaml(updateValuesMap)
        } else {
            console.log("Review and update the values.yaml file in the 'chart' folder as per your project's requirements.")
        }
        console.log("Once values.yaml is updated, run 'cds build' to generate the helm chart. You can find the generated chart in the 'gen' folder within your project directory.")
    }

    async combine() {

        // In case of 'cds add cap-operator --with-mta', service instances, service bindings and workloads are derived from mta.yaml. No need to add them again.
        if (cds.cli.options['with-mta'] || cds.cli.options['generate-runtime-values-via-prompts'] || cds.cli.options['generate-runtime-values-via-input-yaml'])
            return

        const project = cds.add.readProject()
        const { hasDestination, hasHtml5Repo, hasXsuaa, hasApprouter, hasMultitenancy } = project
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))

        if (hasDestination) {
            const destinationYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/destination.yaml.hbs')), project))
            await cds.add.merge(destinationYaml).into(valuesYaml)
        }

        if (hasHtml5Repo) {
            const html5RepoYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/html5Repo.yaml.hbs')), project))
            await cds.add.merge(html5RepoYaml).into(valuesYaml)
        }

        if (hasXsuaa) {
            const xsuaaaYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/xsuaa.yaml.hbs')), project))
            await cds.add.merge(xsuaaaYaml).into(valuesYaml)
        }

        if (hasApprouter || exists('approuter')) {
            const approuterYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/approuter.yaml.hbs')), project))
            await cds.add.merge(approuterYaml).into(valuesYaml)
        }

        if (hasMultitenancy) {
            const saasRegistryYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/saas-registry.yaml.hbs')), project))
            await cds.add.merge(saasRegistryYaml).into(valuesYaml)

            const serviceManagerYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/service-manager.yaml.hbs')), project))
            await cds.add.merge(serviceManagerYaml).into(valuesYaml)
        }

        const workloadsYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/workloads.yaml.hbs')), project))
        await cds.add.merge(workloadsYaml).into(valuesYaml)

        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }

    async generateRuntimeValues() {
        let answerStruct = {}
        const project = cds.add.readProject()

        if(cds.cli.options['generate-runtime-values-via-input-yaml']) {

            answerStruct = yaml.parse(await read(join(cds.root, cds.cli.options['generate-runtime-values-via-input-yaml'])))

            if (!answerStruct['capOperatorSubdomain'] || !answerStruct['clusterDomain'] || !answerStruct['globalAccountId'] || !answerStruct['providerSubdomain'] || !answerStruct['tenantId'] || !answerStruct['hanaInstanceId'] || !answerStruct['imagePullSecret'])
                throw new Error(`'capOperatorSubdomain', 'clusterDomain', 'globalAccountId', 'providerSubdomain', 'tenantId', 'hanaInstanceId' and 'imagePullSecret' are mandatory fields in the input yaml file.`)

        } else {
            const answer = await ask('Enter CAP Operator subdomain (In kyma it is "cap-op" by default): ','Enter your cluster domain: ', 'Enter your global account ID: ', 'Enter your provider subdomain: ', 'Enter your tenant ID: ', 'Enter your HANA database ID: ', 'Enter your image pull secrets: ')

            answerStruct['capOperatorSubdomain'] = answer[0]
            answerStruct['clusterDomain'] = answer[1]
            answerStruct['globalAccountId'] = answer[2]
            answerStruct['providerSubdomain'] = answer[3]
            answerStruct['tenantId'] = answer[4]
            answerStruct['hanaInstanceId'] = answer[5]
            answerStruct['imagePullSecret'] = answer[6]
        }

        answerStruct['appName'] = project['appName']
        answerStruct['appDescription'] = project['appDescription']
        answerStruct['hasMultitenancy'] = project['hasMultitenancy']
        answerStruct['hasXsuaa'] = project['hasXsuaa']

        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))

        const runtimeValuesYaml =  yaml.parse(Mustache.render( await read(join(__dirname, '../files/runtime-values.yaml.hbs')), answerStruct))

        runtimeValuesYaml['workloads'] = {}
        for (const [workloadKey, workloadDetails] of Object.entries(valuesYaml.workloads)) {
            if (workloadDetails.deploymentDefinition)
                runtimeValuesYaml['workloads'][workloadKey] = { "deploymentDefinition": {"env": workloadDetails.deploymentDefinition.env ?? [] }}
            else if (workloadDetails.jobDefinition)
                runtimeValuesYaml['workloads'][workloadKey] = { "jobDefinition": {"env": workloadDetails.jobDefinition.env ?? [] }}

            if (workloadDetails.deploymentDefinition && workloadDetails.deploymentDefinition.type === 'CAP') {
                const index = runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].findIndex(e => e.name === 'CDS_CONFIG')
                if (index > -1)
                    runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index] = {name: 'CDS_CONFIG', value: '{"requires":{"cds.xt.DeploymentService":{"hdi": { "create": {"database_id": "'+ answerStruct["hanaInstanceId"] +'" } }}}}'}
                else
                    runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].push({name: 'CDS_CONFIG', value: '{"requires":{"cds.xt.DeploymentService":{"hdi": { "create": {"database_id": "'+ answerStruct["hanaInstanceId"] +'" } }}}}'})
            }

            if (workloadDetails.jobDefinition && workloadDetails.jobDefinition.type === 'TenantOperation') {
                const index = runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'].findIndex(e => e.name === 'CDS_CONFIG')
                if (index > -1)
                    runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'][index] = {name: 'CDS_CONFIG', value: '{"requires":{"cds.xt.DeploymentService":{"hdi": { "create": {"database_id": "'+ answerStruct["hanaInstanceId"] +'" } }}}}'}
                else
                    runtimeValuesYaml['workloads'][workloadKey]['jobDefinition']['env'].push({name: 'CDS_CONFIG', value: '{"requires":{"cds.xt.DeploymentService":{"hdi": { "create": {"database_id": "'+ answerStruct["hanaInstanceId"] +'" } }}}}'})
            }

            if (workloadDetails.deploymentDefinition && workloadDetails.deploymentDefinition.type === 'Router') {
                const index = runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].findIndex(e => e.name === 'TENANT_HOST_PATTERN')
                if (index > -1)
                    runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'][index] = {name: 'TENANT_HOST_PATTERN', value: '^(.*).'+ answerStruct["appName"] + '.' + answerStruct["clusterDomain"]}
                else
                    runtimeValuesYaml['workloads'][workloadKey]['deploymentDefinition']['env'].push({name: 'TENANT_HOST_PATTERN', value: '^(.*).'+ answerStruct["appName"] + '.' + answerStruct["clusterDomain"]})
            }
        }

        await write(yaml.stringify(runtimeValuesYaml)).to(join(cds.root, 'chart/runtime-values.yaml'))
        console.log("Generated 'runtime-values.yaml' file in the 'chart' folder.")
    }
}
