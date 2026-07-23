const cds = require('@sap/cds-dk')
const { join } = require('node:path')
const { execSync } = require('node:child_process')
const { expect } = require('chai')
const sinon = require('sinon')
const https = require('https')
const zlib = require('zlib')
const { EventEmitter } = require('node:events')
const { Readable } = require('node:stream')

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')
const { capOperatorPlugin } = require('../bin/cap-op-plugin')
const enquirer = require('enquirer')

describe('cap-op-plugin', () => {
    let temp, bookshop

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --nodejs --add multitenancy,approuter,xsuaa,html5-repo,destination`, { cwd: temp })
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

    add-cap-operator-skill [--branch <branch-name> | --version <release-version>]   Add the CAP Operator agent skill to the .agents/skills/cap-operator folder

EXAMPLES

    cap-op-plugin generate-runtime-values
    cap-op-plugin generate-runtime-values --with-input-yaml /path/to/input.yaml

    cap-op-plugin convert-to-configurable-template-chart
    cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml /path/to/runtime.yaml

    cap-op-plugin add-cap-operator-skill
    cap-op-plugin add-cap-operator-skill --branch main
    cap-op-plugin add-cap-operator-skill --version v0.33.0
`)
    })

    it('Generate runtime-values via prompts', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy over a values file with env filled for content job. It should be retained in the generated runtime-values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing chart to configurable template chart', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart`, { cwd: bookshop })

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/values-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
    })

    it('Generate runtime-values via prompts for configurable template chart', async () => {
        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for service only chart', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Convert existing chart to configurable template chart with runtime-values.yaml', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copy filled values.yaml
        await cds.utils.copy(join(__dirname, 'files', 'values-of-simple-chart-filled.yaml'), join(bookshop, 'chart/values.yaml'))
        await cds.utils.copy(join(__dirname, 'files', 'runtime-values-of-simple-chart.yaml'), join(bookshop, 'chart/runtime-values.yaml'))
        execSync(`npx cap-op-plugin convert-to-configurable-template-chart --with-runtime-yaml chart/runtime-values.yaml`, { cwd: bookshop })

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/values-modified.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
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

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-modified-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/values-modified-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
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

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for configurable template chart - IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedConfigurableTemplatesChart/runtime-values-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts for service only chart - IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().resolves({ '0': 'bkshop', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }))

        cds.root = bookshop
        try {
            await capOperatorPlugin('generate-runtime-values')
        } finally {
            sinon.restore()
        }

        expect(getFileHash(join(__dirname, 'files/expectedChart/runtime-values-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/runtime-values.yaml')))
    })

    it('Generate runtime-values via prompts - invalid app name raises error', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        sinon.replaceGetter(enquirer, 'prompt', () => sinon.stub().callsFake((questions) => {
            const answers = { '0': 'MyApp123', '1': 'cap-op', '2': 'c-abc.kyma.ondemand.com', '3': 'dc94db56-asda-adssa-dada-123456789012', '4': 'sdasd-4c4d-4d4d-4d4d-123456789012', '5': 'regcred' }
            for (const question of questions) {
                if (question.validate) {
                    const result = question.validate(answers[question.name])
                    if (result !== true) throw new Error(result)
                }
            }
            return Promise.resolve(answers)
        }))

        cds.root = bookshop
        let error
        try {
            await capOperatorPlugin('generate-runtime-values')
        } catch (e) {
            error = e
        } finally {
            sinon.restore()
        }

        expect(error?.message).to.equal('Only a-z, 0-9 and - are allowed')
    })

    //------------------------------------------------
    // add-cap-operator-skill test cases
    //------------------------------------------------

    describe('add-cap-operator-skill', () => {
        function makeTarGz(files) {
            const blocks = []
            for (const { path: filePath, content } of files) {
                const contentBuf = Buffer.isBuffer(content) ? content : Buffer.from(content)
                const header = Buffer.alloc(512)
                header.write(filePath, 0, 100, 'utf8')
                header.write('0000644\0', 100, 8, 'utf8')
                const sizeOctal = contentBuf.length.toString(8).padStart(11, '0') + ' '
                header.write(sizeOctal, 124, 12, 'utf8')
                header.write('0', 156, 1, 'utf8')
                header.fill(32, 148, 156)
                let sum = 0
                for (let i = 0; i < 512; i++) sum += header[i]
                header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')
                blocks.push(header)
                const padded = Buffer.alloc(Math.ceil(contentBuf.length / 512) * 512)
                contentBuf.copy(padded)
                blocks.push(padded)
            }
            blocks.push(Buffer.alloc(1024))
            return zlib.gzipSync(Buffer.concat(blocks))
        }

        function stubHttpsWithTarball(tag, tarGzBuf) {
            sinon.stub(https, 'get').callsFake((url, _opts, callback) => {
                const req = new EventEmitter()
                setImmediate(() => {
                    if (url.includes('releases/latest')) {
                        const res = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: {} })
                        callback(res)
                        res.push(JSON.stringify({ tag_name: tag }))
                        res.push(null)
                    } else {
                        const res = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: {} })
                        callback(res)
                        res.push(tarGzBuf)
                        res.push(null)
                    }
                })
                return req
            })
        }

        beforeEach(() => { cds.root = bookshop })

        afterEach(() => {
            sinon.restore()
            if (cds.utils.exists(join(bookshop, '.agents')))
                execSync('rm -rf .agents', { cwd: bookshop })
        })

        it('extracts .agents folder from tarball', async () => {
            stubHttpsWithTarball('v0.33.0', makeTarGz([
                { path: 'cap-operator-v0.33.0/.agents/skills/cap-operator/SKILL.md', content: '# SKILL' },
                { path: 'cap-operator-v0.33.0/.agents/skills/cap-operator/references/deploy.md', content: '# deploy' },
                { path: 'cap-operator-v0.33.0/README.md', content: 'readme' }
            ]))

            await capOperatorPlugin('add-cap-operator-skill')

            expect(cds.utils.exists(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.be.ok
            expect(cds.utils.exists(join(bookshop, '.agents/skills/cap-operator/references/deploy.md'))).to.be.ok
            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.equal('# SKILL')
            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/references/deploy.md'))).to.equal('# deploy')
            expect(cds.utils.exists(join(bookshop, '.agents/README.md'))).to.not.be.ok
        })

        it('overwrites existing files', async () => {
            await cds.utils.write('old content').to(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))
            stubHttpsWithTarball('v0.33.0', makeTarGz([
                { path: 'cap-operator-v0.33.0/.agents/skills/cap-operator/SKILL.md', content: 'new content' }
            ]))

            await capOperatorPlugin('add-cap-operator-skill')

            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.equal('new content')
        })

        it('prunes files removed upstream on re-run', async () => {
            stubHttpsWithTarball('v0.33.0', makeTarGz([
                { path: 'cap-operator-v0.33.0/.agents/skills/cap-operator/SKILL.md', content: '# SKILL' },
                { path: 'cap-operator-v0.33.0/.agents/skills/cap-operator/references/old.md', content: '# old' }
            ]))
            await capOperatorPlugin('add-cap-operator-skill')
            expect(cds.utils.exists(join(bookshop, '.agents/skills/cap-operator/references/old.md'))).to.be.ok
            sinon.restore()

            await cds.utils.write('mine').to(join(bookshop, '.agents/skills/my-own/SKILL.md'))

            stubHttpsWithTarball('v0.34.0', makeTarGz([
                { path: 'cap-operator-v0.34.0/.agents/skills/cap-operator/SKILL.md', content: '# SKILL v2' }
            ]))
            await capOperatorPlugin('add-cap-operator-skill')

            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.equal('# SKILL v2')
            expect(cds.utils.exists(join(bookshop, '.agents/skills/cap-operator/references/old.md'))).to.not.be.ok
            expect(await cds.utils.read(join(bookshop, '.agents/skills/my-own/SKILL.md'))).to.equal('mine')
        })

        it('throws when release fetch fails', async () => {
            sinon.stub(https, 'get').callsFake((_url, _opts, callback) => {
                const req = new EventEmitter()
                setImmediate(() => {
                    const res = Object.assign(new Readable({ read() {} }), { statusCode: 404, headers: {} })
                    callback(res)
                    res.push(null)
                })
                return req
            })

            let error
            try { await capOperatorPlugin('add-cap-operator-skill') } catch (e) { error = e }
            expect(error?.message).to.include('HTTP 404')
        })

        it('--branch throws descriptive error when branch does not exist', async () => {
            sinon.stub(https, 'get').callsFake((_url, _opts, callback) => {
                const req = new EventEmitter()
                setImmediate(() => {
                    const res = Object.assign(new Readable({ read() {} }), { statusCode: 404, headers: {} })
                    callback(res)
                    res.push(null)
                })
                return req
            })

            let error
            try { await capOperatorPlugin('add-cap-operator-skill', '--branch', 'no-such-branch') } catch (e) { error = e }
            expect(error?.message).to.equal(`Branch 'no-such-branch' not found in SAP/cap-operator.`)
        })

        it('--version throws descriptive error when release does not exist', async () => {
            sinon.stub(https, 'get').callsFake((_url, _opts, callback) => {
                const req = new EventEmitter()
                setImmediate(() => {
                    const res = Object.assign(new Readable({ read() {} }), { statusCode: 404, headers: {} })
                    callback(res)
                    res.push(null)
                })
                return req
            })

            let error
            try { await capOperatorPlugin('add-cap-operator-skill', '--version', 'v0.0.0') } catch (e) { error = e }
            expect(error?.message).to.equal(`Release 'v0.0.0' not found in SAP/cap-operator.`)
        })

        it('throws when tarball has no .agents folder', async () => {
            stubHttpsWithTarball('v0.1.0', makeTarGz([
                { path: 'cap-operator-v0.1.0/README.md', content: 'readme' }
            ]))

            let error
            try { await capOperatorPlugin('add-cap-operator-skill') } catch (e) { error = e }
            expect(error?.message).to.include('No .agents folder found in cap-operator v0.1.0')
        })

        it('--version downloads specific release tarball without API call', async () => {
            let capturedUrl
            sinon.stub(https, 'get').callsFake((url, _opts, callback) => {
                capturedUrl = url
                const req = new EventEmitter()
                setImmediate(() => {
                    const res = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: {} })
                    callback(res)
                    res.push(makeTarGz([{ path: 'cap-operator-v0.30.0/.agents/skills/cap-operator/SKILL.md', content: '# SKILL v0.30.0' }]))
                    res.push(null)
                })
                return req
            })

            await capOperatorPlugin('add-cap-operator-skill', '--version', 'v0.30.0')

            expect(capturedUrl).to.include('tags/v0.30.0')
            expect(capturedUrl).to.not.include('releases/latest')
            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.equal('# SKILL v0.30.0')
        })

        it('--branch downloads branch tarball without API call', async () => {
            let capturedUrl
            sinon.stub(https, 'get').callsFake((url, _opts, callback) => {
                capturedUrl = url
                const req = new EventEmitter()
                setImmediate(() => {
                    const res = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: {} })
                    callback(res)
                    res.push(makeTarGz([{ path: 'cap-operator-main/.agents/skills/cap-operator/SKILL.md', content: '# SKILL main' }]))
                    res.push(null)
                })
                return req
            })

            await capOperatorPlugin('add-cap-operator-skill', '--branch', 'main')

            expect(capturedUrl).to.include('heads/main')
            expect(capturedUrl).to.not.include('releases/latest')
            expect(await cds.utils.read(join(bookshop, '.agents/skills/cap-operator/SKILL.md'))).to.equal('# SKILL main')
        })

        it('--branch missing value shows usage error', async () => {
            let error
            try { await capOperatorPlugin('add-cap-operator-skill', '--branch', undefined) } catch (e) { error = e }
            expect(error?.message).to.include('Branch name is missing.')
        })

        it('--version missing value shows usage error', async () => {
            let error
            try { await capOperatorPlugin('add-cap-operator-skill', '--version', undefined) } catch (e) { error = e }
            expect(error?.message).to.include('Version is missing.')
        })
    })
})
