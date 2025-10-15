const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")
const fs = require('fs')

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds add cap-operator', () => {
    let temp, bookshop, orignalXsSecurityJson

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --add xsuaa,html5-repo,destination`, { cwd: temp })
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

    it('Add cap-operator chart with service only', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
    })

    it('Add cap-operator chart with service only and mta', async () => {
        expect(() => execSync(`cds add cap-operator --with-service-only --with-mta mta.yaml`, { cwd: bookshop })).to.throw('Option \'--with-service-only\' cannot be used with \'--with-mta\' or \'--with-mta-extensions\'')
    })

    it('Add templates to an existing cap-operator service only chart', async () => {
        execSync(`cds add cap-operator --with-service-only`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/templates/cap-operator-cros-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/domain.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/domain.yaml')))

        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/chart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-binding.yaml')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-instance.yaml')))
    })

    it('Add cap-operator configurable template chart with service only', async () => {

        execSync(`cds add cap-operator --with-service-only --with-configurable-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/domain.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/domain.yaml')))

        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-binding.yaml')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-instance.yaml')))
    })

    it('Add cap-operator chart with service only and IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-service-only --with-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/templates/cap-operator-cros-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
    })

    it('Add cap-operator configurable template chart with service only and IAS', async () => {
        execSync(`cds add ias`, { cwd: bookshop })
        execSync(`cds add cap-operator --with-service-only --with-configurable-templates`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/values-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'chart/templates/_helpers.tpl')))
        expect(getFileHash(join(__dirname,'files/expectedConfigurableTemplatesChart/templates/cap-operator-cros-svc-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/domain-ias.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/domain.yaml')))

        expect(getFileHash(join(__dirname,'../files/configurableTemplatesChart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-binding.yaml')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'chart/templates/service-instance.yaml')))
    })
})
