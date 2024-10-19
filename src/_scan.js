#!/usr/bin/env node

// REF devnotes /depot/knowhow/install+setup+software/UBUNTU/UBUNTU 2019 article/UBUNTU scan command line II.txt

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { green, important, info, purple, warn } from '@nocke/util'

const execAsync = promisify(exec)

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const homeDir = process.env.HOME || '~'
const currentDir = process.cwd()

const knownExtensions = ['pdf', 'jpg', 'png']

/*
 [^<>:"/\\|?*]+: → Starts with one or more valid characters, excluding illegal ones.
 ([ \.][^<>:"/\\|?*]+)* → Allows either a space or a dot followed by more valid characters.
 This supports filenames like "A good.holiday" and "a good holiday.jpg"
 while disallowing double spaces (because each space must be followed by a valid character).

 NOTE: in character classes ([...]), the dot (.) doesn't need to be escaped because it's treated as a literal dot
*/
const validFilename = /^[^<>:"'`/\\|?*\s]+([ .][^<>:"'`/\\|?*\s.]+)*$/

// only weakness: …/egal. pdf
const validFilePath = /^(\.?\.?\/)?([^<>:"'`\/\\|?*\s]+( [^<>:"'`/\\|?*\s]+)*)?(\/([^<>:"'`/\\|?*\s]+( [^<>:"'`/\\|?*\s]+)*)?)*$/


/**
 * Prompts the user for the final filename using zenity.
 * Ensures the filename is trimmed and has the correct extension.
 * Rejects if the filename is empty or only whitespace.
 * @param {string} sourceFilePath - full filepath incl. extension
 * @param {string} ext
 * @returns {Promise<string|null>} - the user-desired, sanitized filename or null.
 */
const promptForUserFilename = (sourceFilePath, ext) => {

  // kdialog wants this, no quotes
  const escapedSourceFilePath = sourceFilePath.replace(/ /g, '\\ ')

  return new Promise((resolve, reject) => {
    const command = `kdialog --getsavefilename ${escapedSourceFilePath}`
    info(`command: ${command}`)

    exec(command, (error, stdout, _stderr) => {
      if (error) {
        reject(error)
      } else {
        let filename = stdout
        filename = filename.trim()

        // add extension if missing
        if (!filename.toLowerCase().endsWith(`.${ext}`)) {
          filename += `.${ext}`
        }

        // normalize known extensions to lowercase, hunt some whitespace
        filename = filename.replace(/\s*\.\s*(pdf|jpg|png)\s*$/i, (_match, ext) => `.${ext.toLowerCase()}`).trim()

        // ensure the filename is not empty after trimming
        if (!validFilePath.test(filename)) {
          important(`invalid filename '${filename}' provided by user prompt.`)
          process.exit(1)
        }

        resolve(filename || null) // Return null if input is empty
      }
    })
  })
}

/**
 * Scans and converts the scanned image to the desired format.
 * In FAKEMODE, it uses a preexisting temp file.
 * @param {string} dir - The directory to save files (also used for the temp file)
 * @param {string} filePath - full target file path
 * @param {string} ext
 * @param {boolean} DRYRUN - whether to skip actual scanning (using committed test jpg)
 */
const scanAndConvert = async (targetDir, filePath, ext, DRYRUN = false) => {

  const tempFile = path.join(targetDir, `.scan-js.temp.${ext === 'pdf' ? 'jpg' : ext}`)

  try {
    if (DRYRUN) {

      info('FAKEMODE enabled. Using preexisting temp file.')
      const mockTempFile = path.join(scriptDir, 'fake_temp.jpg')
      info(`cp "${mockTempFile}" "${tempFile}"`)
      await execAsync(`cp "${mockTempFile}" "${tempFile}"`)

    } else { // real mode
      await execAsync(`rm -f "${tempFile}"`)
      info(`temporary file '${tempFile}' removed.`)
      if (ext === 'pdf') { // scan as JPEG for PDF conversion
        await execAsync(
                    `scanimage --verbose -p --resolution 300 --mode Color --format=jpeg -x 210 -y 297 > "${tempFile}"`
        )
      } else { // scan directly as JPG or PNG
        await execAsync(
                    `scanimage --verbose -p --resolution 300 --mode Color --format=${ext === 'jpg' ? 'jpeg' : ext} -x 210 -y 297 > "${tempFile}"`
        )
      }
      info('Scanning completed', DRYRUN ? 'DRYRUN' : '(real mode)')
    }

    if (ext === 'pdf') { // convert JPEG to PDF
      info(`convert "${tempFile}" -quality 75 -level 20%,90% "${filePath}"`)
      await execAsync(`convert "${tempFile}" -quality 75 -level 20%,90% "${filePath}"`)
      await execAsync(`rm -f "${tempFile}"`)
    } else { // for JPG and PNG, no conversion is needed
      fs.renameSync(tempFile, filePath)
      info(`pixel scan directly saved as ${purple(filePath)}`)
    }
  } catch (error) {
    console.error('error during scan and convert:', error)
    throw error // Re-throw to allow upstream handling
  }
}

/**
 * Avoid scriptDir and homeDir as targetDir (likely when running from run-a-command prompt)
*/
const avoidScriptAndHomeDir = (dir) => (dir === scriptDir || dir === homeDir) ? path.join(homeDir, 'Pictures', 'scan') : dir

/**
 *
 * @param {*} args - remaining arguments after magic words aka path
 * @returns {Array<string>} - [targetDir, suggestedFilename]
 *    targetDir: the target directory
 *    suggestedFilename: the suggested filename ('' to later pick next available filename)
 */
const getDestination = (args) => {

  const rawPath = args.join(' ').trim()

  if (rawPath === '') { // no path provided
    return [avoidScriptAndHomeDir(currentDir), '', '']
  }

  if (fs.existsSync(rawPath) && fs.lstatSync(rawPath).isDirectory()) {
    // no avoidScriptAndHomeDir(), because okay, if explicitly requested
    return [rawPath, '', '']
  }

  // possibly existing dir? (empty will be current '.')
  const possibleDir = path.dirname(rawPath)

  // possibly qualified filename?
  const possibleFilename = path.basename(rawPath) // = basename + ext
  let possibleExt = path.extname(rawPath).replace('.', '').toLocaleLowerCase()

  // `.` just part of basename?
  if (!knownExtensions.includes(possibleExt.toLowerCase())) {
    possibleExt = ''
  }
  const possibleBasename = path.basename(rawPath, possibleExt === '' ? '' : '.' + possibleExt) // basename w/o extension

  important(`possibleDir: '${possibleDir}'`)
  important(`possibleExt: '${possibleExt}'`)

  if (!validFilename.test(possibleFilename)) {
    important(`invalid filename '${possibleFilename}'. Please check the provided path.`)
    process.exit(1) // user error, no ugly stack trace
  }

  if (!fs.existsSync(possibleDir)) { // includes current-dir case `-`
    important(`directory '${possibleDir}' does not exist. Please check the provided path.`)
    process.exit(1) // user error, no ugly stack trace
  }

  return [avoidScriptAndHomeDir(possibleDir), possibleBasename, possibleExt]
}

/**
 * Generates the next available filename in the target directory.
 * @param {string} targetDir - The directory to check for existing files.
 * @param {string} ext - The desired file extension.
 * @returns {string} - The next available filename without extension.
 */
const getDefaultFilename = (targetDir, ext) => {
  const baseFilename = `${new Date().toISOString().split('T')[0]} scan`
  let index = 1
  let candidateBase

  while (index < 100) {
    candidateBase = `${baseFilename} ${String(index).padStart(2, '0')}`
    important(`candidateBase: ${candidateBase}`)

    const candidatePath = path.join(targetDir, `${candidateBase}.${ext}`)

    if (!fs.existsSync(candidatePath)) {
      return candidateBase
    }
    index++
  }
  throw new Error('No available filename found')
}

/**
 * Main function to handle scanning and file naming.
 */
const scanToFile = () => {
  let openFlag = true
  let FAKEMODE = false
  let multiPage = false
  let numOfPages = 1 // default, can become <n> pages or 0 := unlimited „keep-asking-mode“
  let outputFormat = 'pdf'
  let promptingNeeded = false

  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
      Usage: scan [options] [path]

      Options:
        close         Do not open the output file after scanning
        fake          Use fake scanning mode
        all           Scan all pages (unlimited)
        jpg           Output as JPEG
        png           Output as PNG

      Examples:
        scan open /path/to/directory
        scan fake jpg "/path/to/filename"
        scan png all "/path/to/filename"
    `)
    process.exit(0)
  }

  const magicWords = ['close', 'fake', 'all', 'jpg', 'png']

  // process magic words from the beginning of args
  while (args.length > 0) {
    const arg = args[0].toLowerCase()

    if (magicWords.includes(arg)) {
      if (arg === 'close') {
        openFlag = false
      } else if (arg === 'fake') {
        FAKEMODE = true
      } else if (arg === 'all') {
        numOfPages = 0 // Unlimited pages
        multiPage = true
      } else if (arg === 'jpg' || arg === 'png') {
        outputFormat = arg // Set the desired output format
      }
      args.shift() // Remove the processed magic word
    } else if (/^\d{1,3}$/.test(arg)) {
      // arg is a whole number between 1 and 999
      numOfPages = parseInt(arg, 10)
      multiPage = true
      args.shift()
    } else {
      // Not a magic word, stop processing
      break
    }
  }

  // figure out path from remaining argument(s)
  let [dir, basename, ext] = getDestination(args)

  basename = basename.trim()

  if (ext === '') {
    ext = outputFormat
  } else if (outputFormat !== 'pdf' && ext !== outputFormat) {
    warn(`you requested format '${outputFormat}' but gave extension '${ext}'`)
    process.exit()
  }

  if (basename === '') {
    basename = getDefaultFilename(dir, outputFormat)
    ext = outputFormat
    promptingNeeded = true
  }

  if (basename.toLowerCase().endsWith(`.${outputFormat}`)) {
    info('removing already attached extension if meaning type', basename)
    basename = basename.slice(0, -(`.${outputFormat}`).length)
  }

  const fileName = `${basename}.${ext}`
  const filePath = path.join(dir, fileName)

  //   info(purple(`currentDir: ${currentDir}`))
  //   info(purple(`homeDir: ${homeDir}`))
  //   info(purple(`scriptDir: ${scriptDir}`))
  info(purple(`numOfPages: ${numOfPages}`))
  info(purple(`multiPage: ${multiPage}`))
  //   info('promptingNeeded:', promptingNeeded)
  //   info('-------------------------------')
  //   info(purple(`outputFormat | ext:   '${outputFormat}' | '${ext}'`))
  info(green(`dir | basename | ext:\n '${dir}' | '${basename}' | '${ext}'`))

  // scan and prompt concurrently
  // only prompt if no name explicitly provided (nothing / only a path)
  const scanPromise = scanAndConvert(dir, filePath, ext, FAKEMODE)
  const promptPromise = (promptingNeeded) ? promptForUserFilename(filePath, ext) : Promise.resolve(filePath)

  Promise.all([promptPromise, scanPromise])
    .then(([finalFilePath]) => {

      if (filePath !== finalFilePath) {
        fs.renameSync(filePath, finalFilePath)
        info(`Scan saved and renamed from ${filePath} to ${finalFilePath}`)
      } else {
        info(`Scan directly saved as\n${purple(finalFilePath)}`)
      }

      // finally sanity check
      if (!fs.existsSync(finalFilePath)) {
        throw new Error(`'${finalFilePath}' does not exist`)
      }
      if (fs.statSync(finalFilePath).size < 10 * 1024) { // < 10kb
        throw new Error(`'${finalFilePath}' is smaller than 10KB.`)
      }

      if (openFlag) {
        exec(`xdg-open "${finalFilePath}"`)
      }
    })
    .catch(err => {
      console.error('An error occurred:', err)
      process.exit(1)
    })
}

scanToFile()
