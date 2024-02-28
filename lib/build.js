/*
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk');
const { exists, path } = cds.utils

module.exports = class CapOperatorBuildPlugin extends cds.build.BuildPlugin {
  static hasTask() {
    return exists('chart')
  }

  static taskDefaults = {
    src: '.', dest: 'chart'
  }

  async copyTemplates() {
    if (exists(path.join(this.task.src, 'chart/templates'))){
      return await this.copy(path.join(this.task.src, 'chart/templates')).to(path.join(this.task.dest, 'templates'))
    }
    await this.copy(path.join(__dirname, '../files/chart/templates')).to(path.join(this.task.dest, 'templates'))
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
