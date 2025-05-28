/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const { exists, path } = cds.utils
const { isServiceOnlyChart } = require('./util')

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
        if (exists(path.join(this.task.src, 'chart/templates'))) {
            return await this.copy(path.join(this.task.src, 'chart/templates')).to(path.join(this.task.dest, 'templates'))
        }

        await this.copy(path.join(__dirname, '../files/chart/templates/_helpers.tpl')).to(path.join(this.task.dest, 'templates/_helpers.tpl'))
        await this.copy(path.join(__dirname, '../files/commonTemplates/')).to(path.join(this.task.dest, 'templates/'))

        isServiceOnlyChart('chart') ? await this.copy(path.join(__dirname, '../files/chart/templates/cap-operator-cros-svc.yaml')).to(path.join(this.task.dest, 'templates/cap-operator-cros.yaml')) :
            await this.copy(path.join(__dirname, '../files/chart/templates/cap-operator-cros.yaml')).to(path.join(this.task.dest, 'templates/cap-operator-cros.yaml'))
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
