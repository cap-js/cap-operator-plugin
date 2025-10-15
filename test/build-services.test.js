const fs = require('fs')
const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds build', () => {

    let temp, bookshop

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --add xsuaa,html5-repo,destination`, { cwd: temp })
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

    it('Build cap-operator service only chart', async () => {
        execSync(`cds add cap-operator --force --with-service-only`, { cwd: bookshop })
        execSync(`cds build`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/templates/cap-operator-cros-svc.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/templates/cap-operator-cros.yaml')))
        expect(getFileHash(join(__dirname,'files/domain.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/templates/domain.yaml')))

        expect(getFileHash(join(__dirname,'../files/chart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'../files/chart/templates/_helpers.tpl'))).to.equal(getFileHash(join(bookshop, 'gen/chart/templates/_helpers.tpl')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-binding.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/templates/service-binding.yaml')))
        expect(getFileHash(join(__dirname,'../files/commonTemplates/service-instance.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/templates/service-instance.yaml')))
    })
})
