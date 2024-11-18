// this package had a bug that made it unusable.
// forked it and fixed and submitted a PR
//module.exports = require('ghost-google-cloud-storage');
// but for now...

'use strict';

const { Storage } = require('@google-cloud/storage');
const { debug } = require('console');
const BaseStore   = require('ghost-storage-base');
const path        = require('path');
let options     = {};

class GStore extends BaseStore {
    constructor(config = {}){
        super(config);
        options = config;

        const gcs = new Storage({
            keyFilename: options.key
        });

        this.bucket = gcs.bucket(options.bucket);
        this.assetDomain = options.assetDomain || `${options.bucket}.storage.googleapis.com`;
        

        if(options.hasOwnProperty('assetDomain')){
            this.insecure = options.insecure;
        }
        
        this.maxAge = options.maxAge || 2678400;
    }

    async save(file, targetDir) {
        debug(`save: ${file} to ${targetDir}`);

        if (!options) {
            throw new Error('Google Cloud Storage is not configured.')
        }

        targetDir = targetDir || this.getTargetDir();
        const googleStoragePath = `http${this.insecure?'':'s'}://${this.assetDomain}/`;
        let targetFilename;

        const filename = await this.getUniqueFileName(file, targetDir);
        debug(`filename: ${filename}`);
        targetFilename = filename;

        const opts = {
            destination: filename,
            metadata: {
                cacheControl: `public, max-age=${this.maxAge}`
            },
            public: true
        };

        debug(`uploading: ${file.path} to ${filename}, with options: ${JSON.stringify(opts)}`);        
        await this.bucket.upload(file.path, opts);
        return googleStoragePath + targetFilename;
        
    }

    // middleware for serving the files
    serve() {
        // a no-op, these are absolute URLs
        return function (req, res, next) { next(); };
    }

    async exists(fileName, targetDir) {
        const data = await this.bucket.file(path.join(targetDir, fileName)).exists();
        debug(`exists: ${fileName} in ${targetDir} = ${data[0]}`);
        return data[0];
    }

    read(options) {
        options = options || {};

        // remove trailing slashes
        options.path = (options.path || '').replace(/\/$|\\$/, '');
        const targetPath = options.path;

        const rs = this.bucket.file(targetPath).createReadStream();
        debug(`read: ${targetPath}`);
        let contents = null;

        return new Promise((resolve, reject) => {
            rs.on('error', err => {
                debug(`read error: ${err}`);
                return reject(err);
            });

            rs.on('data', data => {
                debug(`read data: ${data}`);
                if (!contents) {
                    contents = data;
                } else {
                    contents = Buffer.concat([contents, data]);
                }
            });

            rs.on('end', () => {
                debug(`read end`);
                return resolve(contents);
            });
      });
    }

    delete(fileName, targetDir) {
        debug(`delete: ${fileName} in ${targetDir}`);
        return this.bucket.file(path.join(targetDir, fileName)).delete();
    }
}

module.exports = GStore;
