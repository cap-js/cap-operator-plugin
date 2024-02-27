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
const { isCAPOperatorChart } = require('./util')

module.exports = class CapOperatorAddPlugin extends cds.add.Plugin {

    async canRun() {
        const { hasMultitenancy, hasApprouter, hasXsuaa } = cds.add.readProject()
        if (!hasXsuaa) {
            console.log(`❌  xsuaa is not added to this project. Run 'cds add xsuaa'.`)
            return false
        } else if (!hasApprouter && !exists('approuter')) {
            console.log(`❌  approuter is not added to this project. Run 'cds add approuter'.`)
            return false
        } else if (!hasMultitenancy) {
            console.log(`❌  Multitenancy is not added to this project. Run 'cds add multitenancy'.`)
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

            if(isCAPOpChart && !exists('chart/templates') && cds.cli.options['add-with-templates'])
                await copy(join(__dirname, '../files/chart/templates')).to('chart/templates')

            if (!isCAPOpChart) {
                throw new Error(`Existing 'chart' folder is not a CAP Operator helm chart. Run 'cds add cap-operator --force' to overwrite.`)
            } else if (isCAPOpChart && md5(JSON.stringify(await read('chart/values.schema.json'))) != md5(JSON.stringify(await read(join(__dirname, '../files/chart/values.schema.json'))))) {
                console.log(`⚠️  'values.schema.json' file is outdated. Run with '--force' to overwrite the file and accept the new changes.`)
            }
            return
        }

        const project = cds.add.readProject()
        await cds.add.merge(__dirname, '../files/chart/Chart.yaml.hbs').into('chart/Chart.yaml', { with: null, project })
        await copy(join(__dirname, '../files/chart/values.yaml')).to('chart/values.yaml')
        await copy(join(__dirname, '../files/chart/values.schema.json')).to('chart/values.schema.json')

        if (cds.cli.options['add-with-templates'])
            await copy(join(__dirname, '../files/chart/templates')).to('chart/templates')

        console.log("`chart` folder generated.")

        if (!cds.cli.options['add-with-mta'] && cds.cli.options['add-with-mta-extensions'])
            throw new Error(`mta YAML not provided. Please pass the mta YAML via option '--add-with-mta'.`)

        if (cds.cli.options['add-with-mta']) {
            const { hasMta } = project
            if (!hasMta) throw new Error(`mta is not added to this project. Run 'cds add mta'.`)

            const mtaTransformer = new MtaTransformer(cds.cli.options['add-with-mta'], cds.cli.options['add-with-mta-extensions'] ? cds.cli.options['add-with-mta-extensions'].split(',') : [])

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
        const project = cds.add.readProject()
        const { hasDestination, hasHtml5Repo } = project
        const Mustache = require('mustache')
        const valuesYaml = yaml.parse(await read(join(cds.root, 'chart/values.yaml')))

        if (hasDestination) {
            const destinationYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/destination.yaml.hbs')), project))
            await cds.add.merge(destinationYaml).into(valuesYaml)
        }

        if (hasHtml5Repo) {
            const html5RepoYaml = yaml.parse(Mustache.render( await read(join(__dirname, '../files/html5Repo.yaml.hbs')), project))
            await cds.add.merge(html5RepoYaml).into(valuesYaml)
        }

        if (hasDestination || hasHtml5Repo) {
            await write(yaml.stringify(valuesYaml)).to(join(cds.root, 'chart/values.yaml'))
        }

    }
}
