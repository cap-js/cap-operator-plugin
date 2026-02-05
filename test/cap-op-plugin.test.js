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
        execSync(`cds init bookshop --add multitenancy,approuter,xsuaa,html5-repo,destination`, { cwd: temp })
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
        await cds.utils.copy(join(__dirname, 'files', 'input_values.yaml'), join(bookshop, 'input_values.yaml'))
        execSync(`cds add cap-operator`, { cwd: bookshop })
        execSync(`npx cap-op-plugin generate-runtime-values --with-input-yaml input_values.yaml`, { cwd: bookshop })

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values file using wrong input_values.yaml', async () => {
        await cds.utils.copy(join(__dirname, 'files', 'input_values_wrong.yaml'), join(bookshop, 'input_values_wrong.yaml'))
        execSync(`cds add cap-operator`, { cwd: bookshop })

        expect(() => execSync(`npx cap-op-plugin generate-runtime-values --with-input-yaml input_values_wrong.yaml`, { cwd: bookshop })).to.throw(`Missing mandatory fields in the input yaml file: appName`)
    })

    it('Generate runtime-values without chart', async () => {
        expect(() => execSync(`npx cap-op-plugin generate-runtime-values`, { cwd: bookshop })).to.throw(`No CAP Operator chart found in the project. Please run 'cds add cap-operator --force' to add the CAP Operator chart folder.`)
    })

    it('Generate runtime-values usage help', async () => {
        expect(() => execSync(`npx cap-op-plugin`, { cwd: bookshop })).to.throw(`
USAGE

    cap-op-plugin <command>

COMMANDS

    generate-runtime-values [--with-input-yaml <input-yaml-path>]   Generate runtime-values.yaml file for the cap-operator chart

    convert-to-configurable-template-chart [--with-runtime-yaml <runtime-yaml-path>]  Convert existing chart to configurable template chart

EXAMPLES

    cap-op-plugin generate-runtime-values
    cap-op-plugin generate-runtime-values --with-input-yaml /path/to/input.yaml

    cap-op-plugin convert-to-configurable-template-chart
    cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml /path/to/runtime.yaml
`)
    })

    it('Generate runtime-values via prompts', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        rlQuestion = sinon.stub()
        rlInterface = {
            question: rlQuestion,
            close: sinon.stub()
        }

        // Copy over a values file with env filled for content job. It should be retained in the generated runtime-values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))

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
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts with multiple xsuaa instances', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        rlQuestion = sinon.stub()
        rlInterface = {
            question: rlQuestion,
            close: sinon.stub()
        }

        // Copy over a values file with multiple xsuaa instances
        await cds.utils.copy(join(__dirname, 'files', 'values-with-multiple-xsuaa.yaml'), join(bookshop, 'chart/values.yaml'))

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
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-multiple-xsuaa.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing chart to configurable template chart', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
    })

    it('Generate runtime-values via prompts for configurable template chart', async () => {
        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

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
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for service only chart', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

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
        rlQuestion.onCall(4).callsArgWith(1, 'sdasd-4c4d-4d4d-4d4d-123456789012')
        rlQuestion.onCall(5).callsArgWith(1, 'regcred')

        cds.root = bookshop
        await capOperatorPlugin('generate-runtime-values')
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing chart to configurable template chart with runtime-values.yaml', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing chart to configurable template chart first then transform runtime-values.yaml', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart`, { cwd: bookshop })

        const log = execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop }).toString()
        expect(log).to.include('Exisiting chart is already a configurable template chart. No need for conversion.')
        expect(log).to.include('Transforming runtime values file')
    })

    it('Convert existing chart to configurable template chart with runtime-values.yaml then trigger again', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop })

        const log = execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop }).toString()
        expect(log).to.include('Exisiting chart is already a configurable template chart. No need for conversion.')
        expect(log).to.include('already in the configurable template chart format.')
    })

    it('Convert existing service chart to configurable template chart with runtime-values.yaml', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-service-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-service-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values-modified-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/runtime-values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing service chart to configurable template chart first then transform runtime-values.yaml', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-service-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-service-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart`, { cwd: bookshop })

        const log = execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop }).toString()
        expect(log).to.include('Exisiting chart is already a configurable template chart. No need for conversion.')
        expect(log).to.include('Transforming runtime values file')
    })

    //------------------------------------------------
    // IAS test cases
    //------------------------------------------------
    it('Generate runtime-values via prompts - IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
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
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for configurable template chart - IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

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
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for service only chart - IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

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
        rlQuestion.onCall(4).callsArgWith(1, 'sdasd-4c4d-4d4d-4d4d-123456789012')
        rlQuestion.onCall(5).callsArgWith(1, 'regcred')

        cds.root = bookshop
        await capOperatorPlugin('generate-runtime-values')
        sinon.restore()

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })
})
