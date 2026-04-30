#!/usr/bin/env node

// const path = require('path');
// const fs = require('fs/promises');
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { diffLines } from 'diff';
import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

class SourceVault {
  constructor(repoPath = '.') {
    this.repoPath = path.join(repoPath, '.vault');
    this.objectPath = path.join(this.repoPath, 'objects');
    this.headPath = path.join(this.repoPath, 'HEAD');
    this.indexPath = path.join(this.repoPath, 'index');
    this.ready = this.init();
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
      await fs.writeFile(this.headPath, '', { flag: 'wx' }); // create if missing
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    try {
      await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
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
    await this.ready;
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
    await fs.writeFile(this.indexPath, JSON.stringify(index));
  }
  async commit(message) {
    await this.ready;
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
    await this.ready;
    try {
      return await fs.readFile(this.headPath, { encoding: 'utf-8' });
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  async log() {
    await this.ready;
    let currentCommitHash = await this.getCurrentHead();
    while (currentCommitHash) {
      const commitData = JSON.parse(
        await fs.readFile(path.join(this.objectPath, currentCommitHash), {
          encoding: 'utf-8',
        })
      );
      console.log(
        `Commit : ${currentCommitHash}\n Date: ${commitData.timeStamp}\n${commitData.message}\n\n`
      );
      currentCommitHash = commitData.parent;
    }
  }
  async showCommitDiff(commitHash) {
    await this.ready;
    const sanitizedHash = String(commitHash).trim();
    const commitData = await this.getCommitData(sanitizedHash);
    if (!commitData) {
      return null;
    }
    console.log('changes in last commit are: ');
    for (const file of commitData.files) {
      console.log(`File: ${file.path}`);
      const fileContent = await this.getFileContent(file.hash);
      console.log(fileContent);

      if (commitData.parent) {
        const parentCommitData = await this.getCommitData(commitData.parent);
        if (!parentCommitData) {
          console.log('Unable to load parent commit data');
          continue;
        }
        const getparentFileContent = await this.getParentContent(
          parentCommitData,
          file.path
        );
        if (getparentFileContent !== undefined) {
          console.log(`\nDiff: `);
          const diff = diffLines(getparentFileContent, fileContent);

          console.log(diff);
          diff.forEach((part) => {
            if (part.added) {
              process.stdout.write(chalk.green(part.value));
            } else if (part.removed) {
              process.stdout.write(chalk.red(part.value));
            } else {
              process.stdout.write(chalk.grey(part.value));
            }
          });
          console.log();
        } else {
          console.log('New file in this commit');
        }
      } else {
        console.log('first commit');
      }
    }
  }
  async getParentContent(parentCommitData, filePath) {
    const parentFile = parentCommitData.files.find(
      (file) => file.path === filePath
    );
    if (parentFile) {
      return await this.getFileContent(parentFile.hash);
    }
  }
  async getFileContent(fileHash) {
    await this.ready;
    const objectPath = path.join(this.objectPath, fileHash);
    return fs.readFile(objectPath, { encoding: 'utf-8' });
  }
  async getCommitData(commitHash) {
    await this.ready;
    const sanitizedHash = String(commitHash).trim();
    const commitPath = path.join(this.objectPath, sanitizedHash);
    try {
      const rawData = await fs.readFile(commitPath, { encoding: 'utf-8' });
      return JSON.parse(rawData);
    } catch (error) {
      console.log('failed to read commit data');
      console.log(error);
      return null;
    }
  }
}
program.version('1.0.0');

program
  .command('add <file>')
  .description('Add a file to the vault')
  .action(async (file) => {
    const vault = new SourceVault(process.cwd());
    await vault.add(file);
  });

program
  .command('commit <message>')
  .description('Create a new commit from staged files')
  .action(async (message) => {
    const vault = new SourceVault(process.cwd());
    await vault.commit(message);
  });

program
  .command('log')
  .description('Show commit history')
  .action(async () => {
    const vault = new SourceVault(process.cwd());
    await vault.log();
  });

program
  .command('diff <commitHash>')
  .description('Show the diff for a commit')
  .action(async (commitHash) => {
    const vault = new SourceVault(process.cwd());
    await vault.showCommitDiff(commitHash);
  });

program
  .command('head')
  .description('Show the current HEAD commit hash')
  .action(async () => {
    const vault = new SourceVault(process.cwd());
    const head = await vault.getCurrentHead();
    console.log(head ? `HEAD: ${head}` : 'No commits yet');
  });

program
  .command('init')
  .description('Initialize a SourceVault in this directory')
  .action(async () => {
    new SourceVault(process.cwd());
    console.log('Initialized SourceVault in .vault/');
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(error.message));
  process.exit(1);
});
