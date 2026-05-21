/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const yaml = require('@sap/cds-foss').yaml
const fs = require('fs')
const { exists, path } = cds.utils
const {
    isServiceOnlyChart,
    getCAPOpCroYaml,
    getConfigurableCapOpCroYaml,
    getServiceInstanceKeyName,
    getDomainCroYaml,
    getHelperTpl,
    isConfigurableTemplateChart
} = require('./util')

module.exports = class CapOperatorBuildPlugin extends cds.build.Plugin {
    static hasTask() {
        return exists('chart')
    }

    static taskDefaults = {
        src: '.', dest: 'chart'
    }

    init() {
        if (this.task.src !== cds.root) {
            throw new Error("Invalid value for property 'src', it must have value '.'")
        }

        // different from the default build output structure
        this.task.dest = path.join(cds.root, cds.env.build.target !== '.' ? cds.env.build.target : 'gen', 'chart')
    }

    async copyTemplates() {
        const userTemplatesDir = path.join(this.task.src, 'chart/templates')
        const destTemplatesDir = path.join(this.task.dest, 'templates')
        const hasUserTemplates = exists(userTemplatesDir)
        const isConfigurableTempChart = isConfigurableTemplateChart(path.join(this.task.src, 'chart'))
        const customTemplateMsg = (name) => `[cap-operator-plugin] Using updated template '${name}' from chart/templates/`
        const defaultTemplateMsg = (name) => `[cap-operator-plugin] Using default template for '${name}'`

        const staticEntry = (name) => {
            const defaultFile = path.join(__dirname, `../files/commonTemplates/${name}`)
            return { name, getDefault: () => cds.utils.read(defaultFile), writeDefault: (dest) => this.copy(defaultFile).to(dest) }
        }
        const generatedEntry = (name, generate) => ({
            name, getDefault: () => generate(), writeDefault: (dest) => cds.utils.write(generate()).to(dest)
        })

        const valuesYaml = yaml.parse(await cds.utils.read(path.join(this.task.src, 'chart/values.yaml')))
        const hasIas = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'identity') != null

        const templates = [
            staticEntry('service-binding.yaml'),
            staticEntry('service-instance.yaml'),
            generatedEntry('_helpers.tpl', () => getHelperTpl({ hasXsuaa: getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa') != null }, isConfigurableTempChart)),
            generatedEntry('domain.yaml', () => getDomainCroYaml({ hasIas })),
            generatedEntry('cap-operator-cros.yaml', () => isConfigurableTempChart ? getConfigurableCapOpCroYaml({ hasIas, isService: isServiceOnlyChart('chart') }) : getCAPOpCroYaml({ hasIas, isService: isServiceOnlyChart('chart') }))
        ]

        for (const { name, getDefault, writeDefault } of templates) {
            const userFile = path.join(userTemplatesDir, name)
            const destFile = path.join(destTemplatesDir, name)
            if (hasUserTemplates && exists(userFile)) {
                const [userContent, defaultContent] = await Promise.all([cds.utils.read(userFile), getDefault()])
                const userStr = userContent?.toString()
                const defaultStr = defaultContent?.toString()
                this.pushMessage(
                    userStr !== defaultStr ? customTemplateMsg(name) : defaultTemplateMsg(name),
                    userStr !== defaultStr ? CapOperatorBuildPlugin.WARNING : CapOperatorBuildPlugin.INFO
                )
                await this.copy(userFile).to(destFile)
            } else {
                this.pushMessage(defaultTemplateMsg(name), CapOperatorBuildPlugin.INFO)
                await writeDefault(destFile)
            }
        }

        if (hasUserTemplates) {
            const knownFiles = new Set(['service-binding.yaml', 'service-instance.yaml', '_helpers.tpl', 'domain.yaml', 'cap-operator-cros.yaml'])
            for (const entry of await fs.promises.readdir(userTemplatesDir, { withFileTypes: true })) {
                if (entry.isDirectory() || !knownFiles.has(entry.name)) {
                    this.pushMessage(`[cap-operator-plugin] Copying user defined template '${entry.name}' from chart/templates/`, CapOperatorBuildPlugin.INFO)
                    await this.copy(path.join(userTemplatesDir, entry.name)).to(path.join(destTemplatesDir, entry.name))
                }
            }
        }
    }

    async copyChartYaml() {
        const chartYamlFileName = 'Chart.yaml'
        await this.copy(path.join(this.task.src, 'chart', chartYamlFileName)).to(path.join(this.task.dest, chartYamlFileName))
    }

    async copyValuesYaml() {
        const valueYamlFileName = 'values.yaml'
        await this.copy(path.join(this.task.src, 'chart', valueYamlFileName)).to(path.join(this.task.dest, valueYamlFileName))

        const valueYamlSchemaFileName = 'values.schema.json'
        await this.copy(path.join(this.task.src, 'chart', valueYamlSchemaFileName)).to(path.join(this.task.dest, valueYamlSchemaFileName))
    }

    async build() {
        this.pushMessage(`[cap-operator-plugin] Generating Helm chart in ${this.task.dest}...`, CapOperatorBuildPlugin.INFO)

        // Copy templates
        await this.copyTemplates()

        // Copy Chart.yaml
        await this.copyChartYaml()

        // Copy values.yaml
        await this.copyValuesYaml()
    }
}
