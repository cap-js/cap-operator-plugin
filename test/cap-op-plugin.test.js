const cds = require('@sap/cds-dk')
const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cap-op-plugin', () => {
    let temp, bookshop

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --add multitenancy,approuter,xsuaa,html5-repo`, { cwd: temp })
        updateDependency(bookshop)
        execSync(`npm install`, { cwd: bookshop })
        setupHack(bookshop)
    })

    afterEach(async () => {
        if (cds.utils.exists(join(bookshop, 'chart'))) execSync(`rm -r chart`, { cwd: bookshop })
    })

    after(async () => {
        undoSetupHack(bookshop)
        await tempUtil.cleanUp()
    })

    it('Generate runtime-values file', async () => {
        await cds.utils.copy(join('test/files', 'input_values.yaml'), join(bookshop, 'input_values.yaml'))
        execSync(`cds add cap-operator`, { cwd: bookshop })
        execSync(`npx cap-op-plugin generate-runtime-values --with-input-yaml input_values.yaml`, { cwd: bookshop })

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values file using wrong input_values.yaml', async () => {
        await cds.utils.copy(join('test/files', 'input_values_wrong.yaml'), join(bookshop, 'input_values_wrong.yaml'))
        execSync(`cds add cap-operator`, { cwd: bookshop })

        expect(() => execSync(`npx cap-op-plugin generate-runtime-values --with-input-yaml input_values_wrong.yaml`, { cwd: bookshop })).to.throw(`'appName', 'capOperatorSubdomain', 'clusterDomain', 'globalAccountId', 'providerSubdomain' and 'tenantId' are mandatory fields in the input yaml file.`)
    })

    it('Generate runtime-values without chart', async () => {
        expect(() => execSync(`npx cap-op-plugin generate-runtime-values`, { cwd: bookshop })).to.throw(`No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.`)
    })

    it('Generate runtime-values usage help', async () => {
        expect(() => execSync(`npx cap-op-plugin`, { cwd: bookshop })).to.throw(`
USAGE

    cap-op-plugin <command> [--with-input-yaml <input-yaml-path>]

COMMANDS

    generate-runtime-values   generate runtime-values.yaml file for the cap-operator chart

EXAMPLES

    cap-op-plugin generate-runtime-values
    cap-op-plugin generate-runtime-values --with-input-yaml /path/to/input.yaml
`)
    })
})
