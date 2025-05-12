/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const { copy, rimraf, exists, path, read, write } = cds.utils
const { join } = path
const yaml = require('@sap/cds-foss').yaml
const md5 = data => require('crypto').createHash('md5').update(data).digest('hex')

const MtaTransformer = require('./mta-transformer')
const { isCAPOperatorChart, isConfigurableTemplateChart, injectTemplateFunction, transformValuesAndFillCapOpCroYaml, isServiceOnlyChart } = require('./util')

const Mustache = require('mustache')

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
        const { hasMultitenancy, hasApprouter, hasXsuaa } = cds.add.readProject()
        if (!hasXsuaa) {
            console.log(`❌  xsuaa is not added to this project. Run 'cds add xsuaa'.`)
            return false
        } else if (!hasApprouter && !exists('approuter') && !cds.cli.options['with-service-only']) {
            console.log(`❌  approuter is not added to this project. Run 'cds add approuter'.`)
            return false
        } else if (!hasMultitenancy && !cds.cli.options['with-service-only']) {
            console.log(`❌  multitenancy is not added to this project. Run 'cds add multitenancy'.`)
            return false
        }
        return true
    }

    static hasInProduction() {
        return !!(exists('chart') && isCAPOperatorChart('chart'))
    }

    async run() {
        if (cds.cli.options['with-configurable-templates'] && cds.cli.options['with-templates']) {
            throw new Error(`Option '--with-templates' cannot be used with '--with-configurable-templates' option.`)
        } else if (!cds.cli.options['with-mta'] && cds.cli.options['with-mta-extensions']) {
            throw new Error(`mta YAML not provided. Please pass the mta YAML via option '--with-mta'.`)
        } else if (cds.cli.options['with-service-only'] && (cds.cli.options['with-mta'] || cds.cli.options['with-mta-extensions'])) {
            throw new Error(`Option '--with-service-only' cannot be used with '--with-mta' or '--with-mta-extensions' options.`)
        }

        if (cds.cli.options.force)
            await rimraf('chart')

        if (exists('chart')) {
            const isConfigurableTempChart = isConfigurableTemplateChart('chart')
            let loggingDone = false
            if (!isCAPOperatorChart('chart')) {
                throw new Error(`Existing 'chart' folder is not a CAP Operator helm chart. Run 'cds add cap-operator --force' to overwrite.`)
            }

            if (!exists('chart/templates') && cds.cli.options['with-templates']) {
                await this.copySimpleChartTemplates(isServiceOnlyChart('chart'))
                console.log("Added 'templates' folder to the 'chart' folder.")
                loggingDone = true
            }

            if (!isConfigurableTempChart && cds.cli.options['with-configurable-templates']) {
                console.log("CAP Operator chart already present. If you want to convert the existing chart to a configurable template chart, run 'npx cap-op-plugin convert-to-configurable-template-chart'")
            }

            const valuesSchemaPath = isConfigurableTempChart ? '../files/configurableTemplatesChart/values.schema.json' : '../files/chart/values.schema.json'
            if (md5(JSON.stringify(await read('chart/values.schema.json'))) !== md5(JSON.stringify(await read(join(__dirname, valuesSchemaPath))))) {
                console.log("⚠️  'values.schema.json' file is outdated. Run with '--force' to overwrite the file and accept the new changes.")
                loggingDone = true
            }

            if (!loggingDone) {
                console.log("CAP Operator chart already present. If you want to overwrite the chart, use `--force' flag.")
            }

            return
        }

        const project = this.readProject(cds.cli.options['with-service-only'])

        if (cds.cli.options['with-configurable-templates']) {
            await copy(join(__dirname, '../files/configurableTemplatesChart/templates/_helpers.tpl')).to('chart/templates/_helpers.tpl')
            await copy(join(__dirname, '../files/configurableTemplatesChart/templates/service-binding.yaml')).to('chart/templates/service-binding.yaml')
            await copy(join(__dirname, '../files/configurableTemplatesChart/templates/service-instance.yaml')).to('chart/templates/service-instance.yaml')
            cds.cli.options['with-service-only'] ? await copy(join(__dirname, '../files/configurableTemplatesChart/templates/cap-operator-cros-svc.yaml')).to('chart/templates/cap-operator-cros.yaml') :
                await copy(join(__dirname, '../files/configurableTemplatesChart/templates/cap-operator-cros.yaml')).to('chart/templates/cap-operator-cros.yaml')

            await cds.add.merge(__dirname, '../files/configurableTemplatesChart/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
            await cds.add.merge(__dirname, '../files/configurableTemplatesChart/values.yaml.hbs').into('chart/values.yaml', { project })
            await copy(join(__dirname, '../files/configurableTemplatesChart/values.schema.json')).to('chart/values.schema.json')

            const originalAppNameFunCode = `{{- define "originalAppName" -}}\n{{ print "` + project['appName'] + `" }}\n{{- end -}}`
            injectTemplateFunction(join(cds.root, 'chart/templates/_helpers.tpl'), originalAppNameFunCode)
        } else {
            await cds.add.merge(__dirname, '../files/chart/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
            await cds.add.merge(__dirname, '../files/chart/values.yaml.hbs').into('chart/values.yaml', { project })
            await copy(join(__dirname, '../files/chart/values.schema.json')).to('chart/values.schema.json')

            if (cds.cli.options['with-templates'])
                await this.copySimpleChartTemplates(cds.cli.options['with-service-only'])
        }

        console.log("`chart` folder generated.")

        if (cds.cli.options['with-mta']) {
            const { hasMta } = project
            if (!hasMta) throw new Error(`mta is not added to this project. Run 'cds add mta'.`)

            const mtaTransformer = new MtaTransformer(cds.cli.options['with-mta'], cds.cli.options['with-mta-extensions'] ? cds.cli.options['with-mta-extensions'].split(',') : [])

            let updateValuesMap = new Map()
            updateValuesMap.set('serviceInstances', await mtaTransformer.getServiceInstances())
            updateValuesMap.set('serviceBindings', await mtaTransformer.getServiceBindings())
            updateValuesMap.set('workloads', await mtaTransformer.getWorkloads())
            await this.updateValuesYaml(updateValuesMap)

            console.log("⚠️  Deriving values.yaml from mta.yaml cannot be done one to one. It's a best guess, so some information might be missing and needs to be reviewed and corrected by the application developer.")

            if (isConfigurableTemplateChart('chart')) {
                await transformValuesAndFillCapOpCroYaml()
            }
        } else {
            console.log("Review and update the values.yaml file in the 'chart' folder as per your project's requirements.")
        }

        // Update xs-security.json
        const { hasXsuaa } = project
        if (hasXsuaa) {
            await cds.add.merge(__dirname, '../files/xs-security.json.hbs').into('xs-security.json', {
                project,
                additions: [{ in: 'scopes', where: { name: '$XSAPPNAME.Callback' } },
                { in: 'scopes', where: { name: '$XSAPPNAME.mtcallback' } }]
            })
        }

        console.log("Once values.yaml is updated, run 'cds build' to generate the helm chart. You can find the generated chart in the 'gen' folder within your project directory.")
    }

    async combine() {

        // In case of 'cds add cap-operator --with-mta', service instances, service bindings and workloads are derived from mta.yaml. No need to add them again.
        if (cds.cli.options['with-mta']) return

        const isServiceOnly = isServiceOnlyChart('chart')
        const project = this.readProject(isServiceOnly)
        const { hasDestination, hasHtml5Repo, hasXsuaa, hasApprouter, hasMultitenancy } = project
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))

        if (hasDestination) {
            const destinationYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/destination.yaml.hbs')), project))
            await cds.add.merge(destinationYaml).into(valuesYaml)
        }

        if (hasHtml5Repo) {
            const html5RepoYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/html5Repo.yaml.hbs')), project))
            await cds.add.merge(html5RepoYaml).into(valuesYaml)
        }

        if (hasXsuaa) {
            const xsuaaaYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/xsuaa.yaml.hbs')), project))
            await cds.add.merge(xsuaaaYaml).into(valuesYaml)
        }

        if (hasMultitenancy || isServiceOnly) {
            const saasRegistryYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/saas-registry.yaml.hbs')), project))
            await cds.add.merge(saasRegistryYaml).into(valuesYaml)

            const serviceManagerYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/service-manager.yaml.hbs')), project))
            await cds.add.merge(serviceManagerYaml).into(valuesYaml)
        }

        if (!isConfigurableTemplateChart('chart')) {
            if ((hasApprouter || exists('approuter')) && !isServiceOnly) {
                const approuterYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/approuter.yaml.hbs')), project))
                await cds.add.merge(approuterYaml).into(valuesYaml)
            }

            const workloadsYaml = yaml.parse(Mustache.render(await read(join(__dirname, '../files/workloads.yaml.hbs')), project))
            await cds.add.merge(workloadsYaml).into(valuesYaml)
        }

        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }

    async updateValuesYaml(updatedValues) {
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))
        for (const [key, value] of updatedValues.entries()) {
            valuesYaml[key] = value
        }
        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }

    async copySimpleChartTemplates(isServiceOnly) {
        await copy(join(__dirname, '../files/chart/templates/_helpers.tpl')).to('chart/templates/_helpers.tpl')
        await copy(join(__dirname, '../files/chart/templates/service-binding.yaml')).to('chart/templates/service-binding.yaml')
        await copy(join(__dirname, '../files/chart/templates/service-instance.yaml')).to('chart/templates/service-instance.yaml')

        isServiceOnly ? await copy(join(__dirname, '../files/chart/templates/cap-operator-cros-svc.yaml')).to('chart/templates/cap-operator-cros.yaml') :
            await copy(join(__dirname, '../files/chart/templates/cap-operator-cros.yaml')).to('chart/templates/cap-operator-cros.yaml')
    }

    readProject(isServiceOnly) {
        return new Proxy(cds.add.readProject(), {
            get(target, prop) {
                if (prop === 'isService') {
                    return isServiceOnly
                }
                if (prop === 'isApp') {
                    return !isServiceOnly
                }
                return target[prop]
            },
            has(target, prop) {
                return prop === 'isService' || prop === 'isApp' || prop in target;
            }
        })
    }
}
