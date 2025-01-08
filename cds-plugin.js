/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds')

cds.build?.register?.('cap-operator', require('./lib/build.js'))

cds.add?.register?.('cap-operator', require('./lib/add.js'))
