/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const { copy, rimraf, exists, path, read, write } = cds.utils
const { join } = path
const yaml = require('@sap/cds-foss').yaml
const md5 = data => require('crypto').createHash('md5').update(data).digest('hex')
const Mustache = require('mustache')

const MtaTransformer = require('./mta-transformer')
const {
    isCAPOperatorChart,
    isConfigurableTemplateChart,
    injectTemplateFunction,
    transformValuesAndFillCapOpCroYaml,
    isServiceOnlyChart,
    getConfigurableCapOpCroYaml,
    getCAPOpCroYaml,
    getDomainCroYaml
} = require('./util')

module.exports = class CapOperatorAddPlugin extends cds.add.Plugin {

    options() {
        return {
            'with-templates': {
                type: 'boolean',
                help: 'To add the templates folder to the chart folder.'
            },
            'with-configurable-templates': {
                type: 'boolean',
                help: 'To add a chart with configurable templates'
            },
            'with-service-only': {
                type: 'boolean',
                help: 'To add a chart with services only'
            },
            'with-mta': {
                type: 'string',
                //help: 'Path to the mta.yaml file.'
            },
            'with-mta-extensions': {
                type: 'string',
                //help: 'Comma separated list of mta extensions to be applied to the mta.yaml file. Can be used only with --with-mta option.'
            }
        }
    }


    async canRun() {
        const { hasMultitenancy, hasApprouter, hasXsuaa, hasIas } = cds.add.readProject()
        const isServiceOnly = cds.cli.options['with-service-only'] || isServiceOnlyChart('chart')

        if (!hasXsuaa && !hasIas) {
            console.log(`❌  Neither xsuaa nor ias is added to this project. Run 'cds add xsuaa' or 'cds add ias'.`)
            return false
        }

        if (!hasApprouter && !exists('approuter') && !isServiceOnly) {
            console.log(`❌  approuter is not added to this project. Run 'cds add approuter'.`)
            return false
        }

        if (!hasMultitenancy && !isServiceOnly) {
            console.log(`❌  multitenancy is not added to this project. Run 'cds add multitenancy'.`)
            return false
        }

        return true
    }

    static hasInProduction() {
        return !!(exists('chart') && isCAPOperatorChart('chart'))
    }

    async run() {
        const opts = cds.cli.options
        const isConfigurable = opts['with-configurable-templates']
        const isServiceOnly = opts['with-service-only']
        const withTemplates = opts['with-templates']

        this.validateOptions(opts)

        if (opts.force) await rimraf('chart')

        // If chart folder exists, read the chart.yaml to determine if it's a service only chart
        const project = this.readProject(isServiceOnly || isServiceOnlyChart('chart'))

        if (exists('chart')) {
            await this.handleExistingChart(project)
            return
        }

        if (isConfigurable) {
            await this.createConfigurableChart(project)
        } else {
            await this.createSimpleChart(project, withTemplates)
        }

        console.log("`chart` folder generated.")

        if (opts['with-mta']) {
            await this.handleMtaIntegration(project)
        } else {
            console.log("Review and update the values.yaml file in the 'chart' folder as per your project's requirements.")
        }

        await this.updateXsSecurity(project)
        console.log("Once values.yaml is updated, run 'cds build' to generate the helm chart. You can find the generated chart in the 'gen' folder within your project directory.")
    }

    async combine() {
        // In case of 'cds add cap-operator --with-mta', service instances, service bindings and workloads are derived from mta.yaml. No need to add them again.
        if (cds.cli.options['with-mta']) return

        const isServiceOnly = isServiceOnlyChart('chart')
        const project = this.readProject(isServiceOnly)
        const {
            hasDestination, hasHtml5Repo, hasXsuaa, hasApprouter,
            hasMultitenancy, hasIas
        } = project

        const valuesPath = join(cds.root, 'chart/values.yaml')
        const valuesYaml = yaml.parse(await read(valuesPath))

        const addIf = async (condition, file) => {
            if (condition) {
                const rendered = Mustache.render(await read(join(__dirname, file)), project)
                await cds.add.merge(yaml.parse(rendered)).into(valuesYaml)
            }
        }

        await addIf(hasDestination, '../files/destination.yaml.hbs')
        await addIf(hasHtml5Repo, '../files/html5Repo.yaml.hbs')
        await addIf(hasIas, '../files/ias.yaml.hbs')
        await addIf(!hasIas && hasXsuaa, '../files/xsuaa.yaml.hbs')

        if (hasMultitenancy) {
            await addIf(hasIas, '../files/subscription-manager.yaml.hbs')
            await addIf(!hasIas && hasXsuaa, '../files/saas-registry.yaml.hbs')
            await addIf(true, '../files/service-manager.yaml.hbs')
        }

        if (!isConfigurableTemplateChart('chart')) {
            await addIf(
                (hasApprouter || exists('approuter')) && !isServiceOnly,
                '../files/approuter.yaml.hbs'
            )
            await addIf(true, '../files/workloads.yaml.hbs')
        }

        await write(yaml.stringify(valuesYaml)).to(valuesPath)
    }

    async updateValuesYaml(updatedValues) {
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))
        for (const [key, value] of updatedValues.entries()) {
            valuesYaml[key] = value
        }
        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }

    async copySimpleChartTemplates(project) {
        await copy(join(__dirname, '../files/chart/templates/_helpers.tpl')).to('chart/templates/_helpers.tpl')
        await copy(join(__dirname, '../files/commonTemplates/')).to('chart/templates/')
        await write(getDomainCroYaml(project)).to('chart/templates/domain.yaml')
        await write(getCAPOpCroYaml(project)).to('chart/templates/cap-operator-cros.yaml')
    }

    readProject(isServiceOnly) {
        return new Proxy(cds.add.readProject(), {
            get(target, prop) {
                if (prop === 'isService') return isServiceOnly
                if (prop === 'isApp') return !isServiceOnly
                return target[prop]
            },
            has(target, prop) {
                return ['isService', 'isApp'].includes(prop) || prop in target
            }
        })
    }

    validateOptions(opts) {
        if (opts['with-configurable-templates'] && opts['with-templates'])
            throw new Error(`Option '--with-templates' cannot be used with '--with-configurable-templates'`)

        if (!opts['with-mta'] && opts['with-mta-extensions'])
            throw new Error(`Missing mta YAML. Use '--with-mta' option`)

        if (opts['with-service-only'] && (opts['with-mta'] || opts['with-mta-extensions']))
            throw new Error(`Option '--with-service-only' cannot be used with '--with-mta' or '--with-mta-extensions'`)
    }

    async handleExistingChart(project) {
        const isConfigurable = isConfigurableTemplateChart('chart')
        let loggingDone = false

        if (!isCAPOperatorChart('chart'))
            throw new Error(`Existing 'chart' folder is not a CAP Operator helm chart. Run 'cds add cap-operator --force' to overwrite.`)

        if (!exists('chart/templates') && cds.cli.options['with-templates']) {
            await this.copySimpleChartTemplates(project)
            console.log("Added 'templates' folder to the 'chart' folder.")
            loggingDone = true
        }

        if (!isConfigurable && cds.cli.options['with-configurable-templates'])
            console.log("CAP Operator chart already present. If you want to convert the existing chart to a configurable template chart, run 'npx cap-op-plugin convert-to-configurable-template-chart'")

        const valuesSchemaPath = isConfigurable
            ? '../files/configurableTemplatesChart/values.schema.json'
            : '../files/chart/values.schema.json'

        const existingSchema = await read('chart/values.schema.json')
        const referenceSchema = await read(join(__dirname, valuesSchemaPath))

        if (md5(JSON.stringify(existingSchema)) !== md5(JSON.stringify(referenceSchema))) {
            console.log("⚠️  'values.schema.json' file is outdated. Run with '--force' to overwrite the file and accept the new changes.")
            loggingDone = true
        }

        if (!loggingDone)
            console.log("CAP Operator chart already present. If you want to overwrite the chart, use `--force' flag.")
    }

    async createConfigurableChart(project) {
        await copy(join(__dirname, '../files/configurableTemplatesChart/templates/_helpers.tpl')).to('chart/templates/_helpers.tpl')
        await copy(join(__dirname, '../files/commonTemplates/')).to('chart/templates/')
        await write(getDomainCroYaml(project)).to('chart/templates/domain.yaml')
        await write(getConfigurableCapOpCroYaml(project)).to('chart/templates/cap-operator-cros.yaml')

        await cds.add.merge(__dirname, '../files/configurableTemplatesChart/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
        await cds.add.merge(__dirname, '../files/configurableTemplatesChart/values.yaml.hbs').into('chart/values.yaml', { project })
        await copy(join(__dirname, '../files/configurableTemplatesChart/values.schema.json')).to('chart/values.schema.json')

        const originalAppNameFunCode = `{{- define "originalAppName" -}}\n{{ print "${project.appName}" }}\n{{- end -}}`
        injectTemplateFunction(join(cds.root, 'chart/templates/_helpers.tpl'), originalAppNameFunCode)
    }

    async createSimpleChart(project, withTemplates) {
        await cds.add.merge(__dirname, '../files/chart/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
        await cds.add.merge(__dirname, '../files/chart/values.yaml.hbs').into('chart/values.yaml', { project })
        await copy(join(__dirname, '../files/chart/values.schema.json')).to('chart/values.schema.json')

        if (withTemplates)
            await this.copySimpleChartTemplates(project)
    }

    async handleMtaIntegration(project) {
        if (!project.hasMta)
            throw new Error(`mta is not added to this project. Run 'cds add mta'.`)

        const { ['with-mta']: mtaPath, ['with-mta-extensions']: mtaExt } = cds.cli.options
        const mtaTransformer = new MtaTransformer(mtaPath, mtaExt ? mtaExt.split(',') : [])

        const updateValuesMap = new Map([
            ['serviceInstances', await mtaTransformer.getServiceInstances()],
            ['serviceBindings', await mtaTransformer.getServiceBindings()],
            ['workloads', await mtaTransformer.getWorkloads()]
        ])

        await this.updateValuesYaml(updateValuesMap)

        console.log("⚠️  Deriving values.yaml from mta.yaml cannot be done one to one. It's a best guess, so some information might be missing and needs to be reviewed and corrected by the application developer.")

        if (isConfigurableTemplateChart('chart'))
            await transformValuesAndFillCapOpCroYaml()
    }

    async updateXsSecurity(project) {
        if (!project.hasXsuaa) return
        await cds.add.merge(__dirname, '../files/xs-security.json.hbs').into('xs-security.json', {
            project,
            additions: [
                { in: 'scopes', where: { name: '$XSAPPNAME.Callback' } },
                { in: 'scopes', where: { name: '$XSAPPNAME.mtcallback' } }
            ]
        })
    }

}
