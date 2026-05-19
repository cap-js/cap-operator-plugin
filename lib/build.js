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
    getServiceInstanceKeyName,
    getDomainCroYaml,
    getHelperTpl
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
        const customTemplateMsg = (name) => `[cap-operator-plugin] Using template '${name}' from chart/templates/`

        for (const name of ['service-binding.yaml', 'service-instance.yaml']) {
            const userFile = path.join(userTemplatesDir, name)
            if (hasUserTemplates && exists(userFile)) {
                console.log(customTemplateMsg(name))
                await this.copy(userFile).to(path.join(destTemplatesDir, name))
            } else {
                await this.copy(path.join(__dirname, `../files/commonTemplates/${name}`)).to(path.join(destTemplatesDir, name))
            }
        }

        const valuesYaml = yaml.parse(await cds.utils.read(path.join(this.task.src, 'chart/values.yaml')))
        const hasIas = getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'identity') != null

        const generatedFiles = [
            {
                name: '_helpers.tpl',
                generate: () => getHelperTpl({ hasXsuaa: getServiceInstanceKeyName(valuesYaml['serviceInstances'], 'xsuaa') != null })
            },
            {
                name: 'domain.yaml',
                generate: () => getDomainCroYaml({ hasIas })
            },
            {
                name: 'cap-operator-cros.yaml',
                generate: () => getCAPOpCroYaml({ hasIas, isService: isServiceOnlyChart('chart') })
            }
        ]

        for (const { name, generate } of generatedFiles) {
            const userFile = path.join(userTemplatesDir, name)
            if (hasUserTemplates && exists(userFile)) {
                console.log(customTemplateMsg(name))
                await this.copy(userFile).to(path.join(destTemplatesDir, name))
            } else {
                await cds.utils.write(generate()).to(path.join(destTemplatesDir, name))
            }
        }

        if (hasUserTemplates) {
            const knownFiles = new Set(['service-binding.yaml', 'service-instance.yaml', '_helpers.tpl', 'domain.yaml', 'cap-operator-cros.yaml'])
            for (const entry of await fs.promises.readdir(userTemplatesDir)) {
                if (!knownFiles.has(entry)) {
                    await this.copy(path.join(userTemplatesDir, entry)).to(path.join(destTemplatesDir, entry))
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
        // Copy templates
        await this.copyTemplates()

        // Copy Chart.yaml
        await this.copyChartYaml()

        // Copy values.yaml
        await this.copyValuesYaml()
    }
}
