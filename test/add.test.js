const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")
const fs = require('fs')

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFolderHash, getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds add cap-operator', () => {
    let temp, bookshop, orignalXsSecurityJson

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --add multitenancy,approuter,xsuaa,html5-repo,destination`, { cwd: temp })
        updateDependency(bookshop)
        execSync(`npm install`, { cwd: bookshop })
        setupHack(bookshop)
        orignalXsSecurityJson = fs.readFileSync(bookshop+"/xs-security.json", 'utf8')
    })

    afterEach(async () => {
        if (cds.utils.exists(join(bookshop, 'chart'))) execSync(`rm -r chart`, { cwd: bookshop })
    })

    after(async () => {
        undoSetupHack(bookshop)
        await tempUtil.cleanUp()
    })

    it('Add cap-operator chart', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))

        // Check changes to xs-security.json
        expect(getFileHash(join(__dirname,'files/xs-security.json'))).to.equal(getFileHash(join(bookshop, 'xs-security.json')))
    })

    it('Add cap-operator chart with force', async () => {
        execSync(`cds add cap-operator --force`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
    })

    it('Add templates to an existing cap-operator chart', async () => {
        execSync(`cds add cap-operator --force`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))

        expect(getFolderHash(join(__dirname,'../files/chart/templates'))).to.equal(getFolderHash(join(bookshop, 'chart/templates')))
    })

    it('Chart folder already added by `cds add helm` ', async () => {
        execSync(`cds add helm --y`, { cwd: bookshop })
        expect(() => execSync(`cds add cap-operator`, { cwd: bookshop })).to.throw('Existing \'chart\' folder is not a CAP Operator helm chart. Run \'cds add cap-operator --force\' to overwrite.')
    })

    it('Chart folder already added but values.schema.json changed ', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        // Copying a dummy change to mimic a difference. In real scenario, the chart/values.schema.json inside the plugin repo will be updated.
        // We dont expect users to change the values.schema.json file manually.
        await cds.utils.copy(join('test/files', 'updatedValues.schema.json'), join(bookshop, 'chart/values.schema.json'))

        const log = execSync(`cds add cap-operator`, { cwd: bookshop }).toString()
        expect(log).to.include('⚠️  \'values.schema.json\' file is outdated. Run with \'--force\' to overwrite the file and accept the new changes.')
    })

    it('Add cap-operator chart with templates', async () => {
        execSync(`cds add cap-operator --with-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFolderHash(join(__dirname,'../files/chart/templates'))).to.equal(getFolderHash(join(bookshop, 'chart/templates')))
    })

    it('Add cap-operator chart with mta but mta.yaml is not present', async () => {
        expect(() => execSync(`cds add cap-operator --with-mta mta.yaml`, { cwd: bookshop })).to.throw('mta is not added to this project. Run \'cds add mta\'.')
    })

    it('Add cap-operator chart without mta.yaml but with mta extensions', async () => {
        expect(() => execSync(`cds add cap-operator --with-mta-extensions corrected_xsappname.mtaext`, { cwd: bookshop })).to.throw('mta YAML not provided. Please pass the mta YAML via option \'--with-mta\'.')
    })

    it('Add cap-operator chart with mta and mtaExtensions', async () => {
        await cds.utils.copy(join('test/files', 'mta.yaml'), join(bookshop, 'mta.yaml'))
        await cds.utils.copy(join('test/files', 'corrected_xsappname.mtaext'), join(bookshop, 'corrected_xsappname.mtaext'))
        // revert xs-security to original value
        fs.writeFileSync(bookshop+"/xs-security.json", orignalXsSecurityJson)

        execSync(`cds add cap-operator --with-mta mta.yaml --with-mta-extensions corrected_xsappname.mtaext`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/valuesWithMTA.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/xs-security.json'))).to.equal(getFileHash(join(bookshop, 'xs-security.json')))
    })

    it('Add cap-operator chart and add destination', async () => {
        execSync(`cds add cap-operator --force`, { cwd: bookshop })
        execSync(`cds add destination`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/valuesWithDestination.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
    })

    it('Add cap-operator configurable template chart', async () => {
        // revert xs-security to original value
        fs.writeFileSync(bookshop+"/xs-security.json", orignalXsSecurityJson)

        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))

        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/templates/cap-operator-cros.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/templates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-instance.yaml')))
        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/templates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-binding.yaml')))

         // Check changes to xs-security.json
         expect(getFileHash(join(__dirname,'files/xs-security.json'))).to.equal(getFileHash(join(bookshop, 'xs-security.json')))
    })

    it('Add cap-operator configurable template chart with cap-operator chart already present', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })

        const log = execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop }).toString()
        expect(log).to.include("CAP Operator chart already present. If you want to convert the existing chart to a configurable template chart, run 'npx cap-op-plugin convert-to-configurable-template-chart'")

    })

    it('Chart folder already added but values.schema.json changed ', async () => {
        execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop })

        // Copying a dummy change to mimic a difference. In real scenario, the chart/values.schema.json inside the plugin repo will be updated.
        // We dont expect users to change the values.schema.json file manually.
        await cds.utils.copy(join('test/files', 'updatedValues.schema.json'), join(bookshop, 'chart/values.schema.json'))

        const log = execSync(`cds add cap-operator --with-configurable-templates`, { cwd: bookshop }).toString()
        expect(log).to.include('⚠️  \'values.schema.json\' file is outdated. Run with \'--force\' to overwrite the file and accept the new changes.')
    })

    it('Add cap-operator configurable template chart with mta and mtaExtensions', async () => {
        await cds.utils.copy(join('test/files', 'mta.yaml'), join(bookshop, 'mta.yaml'))
        await cds.utils.copy(join('test/files', 'corrected_xsappname.mtaext'), join(bookshop, 'corrected_xsappname.mtaext'))
        // revert xs-security to original value
        fs.writeFileSync(bookshop+"/xs-security.json", orignalXsSecurityJson)

        execSync(`cds add cap-operator --with-mta mta.yaml --with-mta-extensions corrected_xsappname.mtaext --with-configurable-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/valuesWithMTA.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-mta.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))
        expect(getFileHash(join(__dirname,'files/xs-security.json'))).to.equal(getFileHash(join(bookshop, 'xs-security.json')))
    })
})
