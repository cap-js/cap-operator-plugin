const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds add cap-operator-with-flexible-templates', () => {
    let temp, bookshop

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
        execSync(`rm -r chart`, { cwd: bookshop })
    })

    after(async () => {
        undoSetupHack(bookshop)
        await tempUtil.cleanUp()
    })

    it('Add cap-operator flexible template chart', async () => {
        execSync(`cds add cap-operator-with-flexible-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChartFlexibleTemplates/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChartFlexibleTemplates/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChartFlexibleTemplates/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))

        expect(getFileHash(join(__dirname,'../files/chartFlexibleTemplates/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/chartFlexibleTemplates/templates/cap-operator-cros.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'../files/chartFlexibleTemplates/templates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-instance.yaml')))
        expect(getFileHash(join(__dirname,'../files/chartFlexibleTemplates/templates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-binding.yaml')))

         // Check changes to xs-security.json
         expect(getFileHash(join(__dirname,'files/xs-security.json'))).to.equal(getFileHash(join(bookshop, 'xs-security.json')))
    })

    it('Chart folder already added by `cds add helm` ', async () => {
        execSync(`cds add helm --y`, { cwd: bookshop })
        expect(() => execSync(`cds add cap-operator-with-flexible-templates`, { cwd: bookshop })).to.throw('Existing \'chart\' folder is not a CAP Operator helm chart. Run \'cds add cap-operator-with-flexible-templates --force\' to overwrite.')
    })

    it('Chart folder already added but values.schema.json changed ', async () => {
        execSync(`cds add cap-operator-with-flexible-templates`, { cwd: bookshop })

        // Copying a dummy change to mimic a difference. In real scenario, the chart/values.schema.json inside the plugin repo will be updated.
        // We dont expect users to change the values.schema.json file manually.
        await cds.utils.copy(join('test/files', 'updatedValues.schema.json'), join(bookshop, 'chart/values.schema.json'))

        const log = execSync(`cds add cap-operator-with-flexible-templates`, { cwd: bookshop }).toString()
        expect(log).to.include('⚠️  \'values.schema.json\' file is outdated. Run with \'--force\' to overwrite the file and accept the new changes.')
    })
})
