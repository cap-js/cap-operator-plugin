const { join } = require('path')
const { execSync } = require('child_process')
const { expect } = require("chai")

const TempUtil = require('./tempUtil')
const tempUtil = new TempUtil(__filename, { local: true })

const { updateDependency, setupHack, undoSetupHack } = require('./util')

describe('cds add cap-operator canRun method test', () => {
    let temp, bookshop

    before(async () => {
        await tempUtil.cleanUp()
        temp = await tempUtil.mkTempFolder()
        bookshop = join(temp, 'bookshop')
        execSync(`cds init bookshop`, { cwd: temp })
        updateDependency(bookshop)
        execSync(`npm install`, { cwd: bookshop })
        setupHack(bookshop)
    })

    after(async () => {
        undoSetupHack(bookshop)
        await tempUtil.cleanUp()
    })

    it('Add cap-operator chart without xsuaa', async () => {
        // TODO: should also log: '❌  xsuaa is not added to this project. Run \'cds add xsuaa\'.'
        expect(() => execSync(`cds add cap-operator`, { cwd: bookshop })).to.throw('cannot run plugin \'cap-operator\'')
    })
    it('Add cap-operator chart without approuter', async () => {
        execSync(`cds add xsuaa`, { cwd: bookshop })
        // TODO: should also log: '❌  approuter is not added to this project. Run \'cds add approuter\'.'
        expect(() => execSync(`cds add cap-operator`, { cwd: bookshop })).to.throw('cannot run plugin \'cap-operator\'')
    })
    it('Add cap-operator chart without mulitenancy', async () => {
        execSync(`cds add xsuaa`, { cwd: bookshop })
        execSync(`cds add approuter`, { cwd: bookshop })
        // TODO: should also log: '❌  multitenancy is not added to this project. Run \'cds add multitenancy\'.'
        expect(() => execSync(`cds add cap-operator`, { cwd: bookshop })).to.throw('cannot run plugin \'cap-operator\'')
    })
})
