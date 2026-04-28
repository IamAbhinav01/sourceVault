// const path = require('path');
// const fs = require('fs/promises');
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { timeStamp } from 'console';
import { json } from 'stream/consumers';
class SourceVault {
  constructor(repoPath = '.') {
    this.repoPath = path.join(repoPath, '.vault');
    this.objectPath = path.join(this.repoPath, 'objects');
    this.headPath = path.join(this.repoPath, 'HEAD');
    this.indexPath = path.join(this.repoPath, 'index');
    this.init();
  }
  /* structure of git
.git/
   objects/
       ab/
          123456...
       cd/
          789abc... 
          we need a folder to store many files.
          
          
         HEAD is just a pointer, not a collection 
          
          */
  async init() {
    /*i have to  create some sort of .git like thing ...mm*/
    await fs.mkdir(this.objectPath, {
      recursive: true,
    }); /*{ recursive: true }: to create all parent drirectory if it doesnot exsit  */

    try {
      await fs.writeFile(this.headPath, '', { flag: 'wx' }); //w means write x means exclusive , => write only if file exisists else throw error
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: 'wx' });
    } catch (error) {
      console.log(error);
    }
  }

  /* for hashin g in nodejs there is a lib called crypto */
  //git uses SHA-1
  // Output length: 160 bits
  // Hex length: 40 characters.
  hashObject(context) {
    return crypto.createHash('sha1').update(context, 'utf-8').digest('hex');
  }
  async add(fileNeededToAdd) {
    const fileData = await fs.readFile(fileNeededToAdd, { encoding: 'utf-8' });
    const fileHash = this.hashObject(fileData);
    console.log(fileHash);
    const newObjectHash = path.join(this.objectPath, fileHash);
    await fs.writeFile(newObjectHash, fileData);
    await this.updateStagingArea(fileNeededToAdd, fileHash);
    console.log(`Added ${fileNeededToAdd}`);
  }

  async updateStagingArea(filePath, fileHash) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: 'utf-8' })
    );
    index.push({ path: filePath, hash: fileHash });
    fs.writeFile(this.indexPath, JSON.stringify(index));
  }
  async commit(message) {
    const index = JSON.parse(
      await fs.readFile(this.indexPath, { encoding: 'utf-8' })
    );
    const parentCommit = await this.getCurrentHead();
    const commitData = {
      timeStamp: new Date().toISOString(),
      message,
      files: index,
      parent: parentCommit,
    };
    const commitHash = this.hashObject(JSON.stringify(commitData));
    const commitPath = path.join(this.objectPath, commitHash);
    await fs.writeFile(commitPath, JSON.stringify(commitData));
    await fs.writeFile(this.headPath, commitHash);
    await fs.writeFile(this.indexPath, JSON.stringify([]));
    console.log(`Commit successfuly created at :${commitHash}`);
  }
  async getCurrentHead() {
    try {
      return await fs.readFile(this.headPath, { encoding: 'utf-8' });
    } catch (error) {
      console.log(error);
      return null;
    }
  }
}
(async () => {
  const sourcevault = new SourceVault();
  await sourcevault.add('sample.txt');
  await sourcevault.commit('initial commit');
})();
