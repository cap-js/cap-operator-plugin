const crypto = require('crypto');
const os = require('os');
const path = require('path');
const cds = require('@sap/cds-dk');
const { fs } = cds.utils;

/**
 * Use instance to ensure that tempFolders list is not global
 * but local to each test
 *
 * const TempUtil = require('./utils/tempUtil');
 * const tempUtil = new TempUtil(__filename);
 *
 * afterAll(async () => {
 *      await tempUtil.cleanUp();
 * });
 *
 * Inside test:
 * async () => {
 *      const tempFolder = await tempUtil.mkTempFolder();
 */
module.exports = class TempUtil {
    long;
    folderRndBytes;

    constructor(fileName, { local = false, long = true, folderRndBytes = 4 } = {}) {
        this.long = long;
        this.folderRndBytes = folderRndBytes;
        const random = this.getRandomString(2);
        this.rootTempFolder = path.join(local ? path.dirname(fileName) : os.tmpdir(), `${long ? `${path.basename(fileName)}_` : ''}${random}.tmp`);
    }

    getRandomString(length) {
        return crypto.randomBytes(length).toString('hex')
    }

    async mkTempFolder() {
        const random = this.getRandomString(this.folderRndBytes);
        const tempFolder = path.join(this.rootTempFolder, `${(this.long) ? 'test_' : ''}${random}`);
        await fs.mkdirp(tempFolder);
        return tempFolder;
    }

    async cleanUp() {
        // FIXME chdir should not be necessary here
        const cwd = path.normalize(process.cwd());
        if (cwd.startsWith(this.rootTempFolder)) {
            process.chdir(os.tmpdir());
        }

        await fs.rimraf(this.rootTempFolder);
    }

    async mkTempProject(src) {
        const tempFolder = await this.mkTempFolder();
        const dest = path.join(tempFolder, path.basename(src));
        await fs.copy(src).to(dest);
        return dest;
    }
}
