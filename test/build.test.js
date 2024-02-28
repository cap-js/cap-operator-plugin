const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { getFolderHash, getFileHash, updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds build', () => {

    let temp, bookshop

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop --add multitenancy,approuter,xsuaa`, { cwd: temp })
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

    it('Build cap-operator chart', async () => {
        execSync(`cds add cap-operator`, { cwd: bookshop })
        execSync(`cds build`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.yaml')))
        expect(getFolderHash(join(__dirname,'files/expectedChart/templates'))).to.equal(getFolderHash(join(bookshop, 'gen/chart/templates')))
    })

    it('Build cap-operator chart with modified templates', async () => {
        execSync(`cds add cap-operator --add-with-templates`, { cwd: bookshop })

        //modify template - dummy file delete
        await cds.utils.rimraf(join(bookshop,'chart/templates/_helpers.tpl'))

        execSync(`cds build`, { cwd: bookshop })

        expect(getFileHash(join(__dirname,'files/expectedChart/Chart.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/Chart.yaml')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.schema.json'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.schema.json')))
        expect(getFileHash(join(__dirname,'files/expectedChart/values.yaml'))).to.equal(getFileHash(join(bookshop, 'gen/chart/values.yaml')))
        expect(getFolderHash(join(__dirname,'files/expectedChart/templates'))).to.not.equal(getFolderHash(join(bookshop, 'gen/chart/templates')))
    })
})
