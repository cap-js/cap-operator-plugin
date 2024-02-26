/*
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const CapOperatorAddPlugin = require('./add')

module.exports = class CapOperatorAddTemplatePlugin extends CapOperatorAddPlugin {

    async run() {
        await super.run()
        await cds.utils.copy(cds.utils.path.join(__dirname, '../files/chart/templates')).to('chart/templates')
    }
}
