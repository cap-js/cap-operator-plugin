const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function getFolderHash(folder) {
    const files = getAllFiles(folder)
    const hashes = []

    files.forEach(file => {
        const data = fs.readFileSync(file)
        const hash = crypto.createHash('md5').update(data).digest('hex')
        hashes.push(hash)
    })

    // Combine all hashes to generate a unique hash for the folder
    const combinedHash = crypto.createHash('md5').update(hashes.join()).digest('hex')
    return combinedHash
}

function getFileHash(file){
    const data = fs.readFileSync(file)
    const hash = crypto.createHash('md5').update(data).digest('hex')
    return hash
}

function getAllFiles(folder) {
    let files = []

    fs.readdirSync(folder).forEach(file => {
        const fullPath = path.join(folder, file)
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(getAllFiles(fullPath))
        } else {
            files.push(fullPath)
        }
    })

    return files
}

function updateDependency(projectFolder) {
    // write dependency in package.json
    const packageJSONPath = path.join(projectFolder, 'package.json')
    const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'))
    packageJSON.devDependencies["@sap/cap-operator-plugin"] = "file:../../../../"
    fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 4))
}

function setupHack(projectFolder) {
    // Required to get the plugin called during npm link. With other approaches(eg: npm pack), we don't get the coverage.
    const cdsPlugin = fs.readFileSync(path.join(projectFolder, 'node_modules/@sap/cap-operator-plugin/cds-plugin.js'), 'utf8')
    // Replace requires from cds to cds-dk
    const updatedData = cdsPlugin.replace(/^const cds = require\('@sap\/cds'\)/m, "const cds = require('@sap/cds-dk')");
    fs.writeFileSync(path.join(projectFolder, 'node_modules/@sap/cap-operator-plugin/cds-plugin.js'), updatedData)
}

function undoSetupHack(projectFolder) {
    const cdsPlugin = fs.readFileSync(path.join(projectFolder, 'node_modules/@sap/cap-operator-plugin/cds-plugin.js'), 'utf8')
    // Replace back to cds
    const updatedData = cdsPlugin.replace(/^const cds = require\('@sap\/cds-dk'\)/m, "const cds = require('@sap/cds')");
    fs.writeFileSync(path.join(projectFolder, 'node_modules/@sap/cap-operator-plugin/cds-plugin.js'), updatedData)
}

module.exports = { getFolderHash, getFileHash, updateDependency, setupHack, undoSetupHack }
