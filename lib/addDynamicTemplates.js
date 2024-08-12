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
const { isCAPOperatorChart, isDynamicTemplateChart } = require('./util')

const Mustache = require('mustache')

module.exports = class CapOperatorAddDynamicTemplatesPlugin extends cds.add.Plugin {

    // options() {
    //     return {}
    // }

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

    async run() {
        if (cds.cli.options.force) await rimraf('chart')
        else if (exists('chart')) {
            let isCAPOpChart = isCAPOperatorChart('chart')

            if (!isCAPOpChart) {
                throw new Error(`Existing 'chart' folder is not a CAP Operator helm chart. Run 'cds add cap-operator --force' to overwrite.`)
            } else if (isCAPOpChart && md5(JSON.stringify(await read('chart/values.schema.json'))) != md5(JSON.stringify(await read(join(__dirname, '../files/chart/values.schema.json'))))) {
                console.log("⚠️  'values.schema.json' file is outdated. Run with '--force' to overwrite the file and accept the new changes.")
            }
            return
        }

        const project = cds.add.readProject()
        await copy(join(__dirname, '../files/chartDynamicTemplates/templates')).to('chart/templates')
        await cds.add.merge(__dirname, '../files/chartDynamicTemplates/Chart.yaml.hbs').into('chart/Chart.yaml', { project })
        await copy(join(__dirname, '../files/chartDynamicTemplates/values.yaml')).to('chart/values.yaml')
        await copy(join(__dirname, '../files/chartDynamicTemplates/values.schema.json')).to('chart/values.schema.json')


        console.log("`chart` folder with dynamic templates generated.")
        console.log("Review and update the values.yaml file in the 'chart' folder as per your project's requirements.")
    }

    async combine() {

        if (!isDynamicTemplateChart('chart')) return

        const project = cds.add.readProject()
        const { hasDestination, hasHtml5Repo, hasXsuaa, hasMultitenancy } = project
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

            await cds.add.merge(__dirname, '../files/xs-security.json.hbs').into('xs-security.json', {
                project,
                additions: [{ in: 'scopes', where: { name: '$XSAPPNAME.Callback' }},
                            { in: 'scopes', where: { name: '$XSAPPNAME.mtcallback' }}]
              })
        }

        if (hasMultitenancy) {
            const saasRegistryYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/saas-registry.yaml.hbs')), project))
            await cds.add.merge(saasRegistryYaml).into(valuesYaml)

            const serviceManagerYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/service-manager.yaml.hbs')), project))
            await cds.add.merge(serviceManagerYaml).into(valuesYaml)
        }

        await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
    }
}
