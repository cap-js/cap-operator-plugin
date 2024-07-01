const cds = require('@sap/cds-dk')
const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")
const readline = require('readline')
const sinon = require('sinon')

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')
const { capOperatorPlugin } = require('../bin/cap-op-plugin')

describe('cap-op-plugin', () => {
    let temp, bookshop
    let rlInterface
    let rlQuestion

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

    it('Generate runtime-values via prompts', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        rlQuestion = sinon.stub()
        rlInterface = {
            question: rlQuestion,
            close: sinon.stub()
        }
        sinon.stub(readline, 'createInterface').returns(rlInterface)

        rlQuestion.onFirstCall().callsArgWith(1, 'bkshop')
        rlQuestion.onSecondCall().callsArgWith(1, '')
        rlQuestion.onThirdCall().callsArgWith(1, 'c-abc.kyma.ondemand.com')
        rlQuestion.onCall(3).callsArgWith(1, 'dc94db56-asda-adssa-dada-123456789012')
        rlQuestion.onCall(4).callsArgWith(1, 'bem-aad-sadad-123456789012')
        rlQuestion.onCall(5).callsArgWith(1, 'dasdsd-1234-1234-1234-123456789012')
        rlQuestion.onCall(6).callsArgWith(1, 'sdasd-4c4d-4d4d-4d4d-123456789012')
        rlQuestion.onCall(7).callsArgWith(1, 'regcred')

        cds.root = bookshop
        await capOperatorPlugin('generate-runtime-values')

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))

        sinon.restore()
    })
})
