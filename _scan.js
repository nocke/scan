#!/usr/bin/env node

// REF devnotes /depot/knowhow/install+setup+software/UBUNTU/UBUNTU 2019 article/UBUNTU scan command line II.txt

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { green, important, info, purple } from '@nocke/util'

const execAsync = promisify(exec)

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const homeDir = process.env.HOME || '~'
const currentDir = process.cwd()

/*
 [^<>:"/\\|?*]+: → Starts with one or more valid characters, excluding illegal ones.
 ([ \.][^<>:"/\\|?*]+)* → Allows either a space or a dot followed by more valid characters.
 This supports filenames like "A good.holiday" and "a good holiday.jpg"
 while disallowing double spaces (because each space must be followed by a valid character).

 NOTE: in character classes ([...]), the dot (.) doesn't need to be escaped because it's treated as a literal dot
*/
const validFilename = /^[^<>:"/\\|?*, ]+([ .][^<>:"/\\|?*, .]+)*$/

/**
 * Prompts the user for the final filename using zenity.
 * Ensures the filename is trimmed and has the correct extension.
 * Rejects if the filename is empty or only whitespace.
 * @param {string} defaultFilename - The default filename to suggest.
 * @param {string} ext - The desired file extension.
 * @returns {Promise<string|null>} - The sanitized filename or null.
 */
const promptForUserFilename = (defaultFilename, ext) => {
  const defaultName = path.basename(defaultFilename)
  return new Promise((resolve, reject) => {
    const command = `zenity --entry --title="Enter Filename" --text="Enter filename:" --entry-text="${defaultName}"`
    exec(command, (error, stdout, _stderr) => {
      if (error) {
        reject(error)
      } else {
        let filename = stdout // No initial trim here

        // Prevent leading and trailing whitespace
        filename = filename.trim()

        // Avoid double extensions
        if (!filename.toLowerCase().endsWith(`.${ext}`)) {
          filename += `.${ext}`
        }

        // Normalize extension to lowercase
        filename = filename.replace(/\.[^.]+$/, (extension) => extension.toLowerCase()).trim()

        // Ensure the filename is not empty after trimming
        if (filename === `.${ext}`) { // User entered only whitespace
          reject(new Error('Filename cannot be empty or whitespace only.'))
          return
        }

        resolve(filename || null) // Return null if input is empty
      }
    })
  })
}

/**
 * Scans and converts the scanned image to the desired format.
 * In FAKEMODE, it uses a preexisting temp file.
 * @param {string} targetDir - The directory to save files.
 * @param {string} filename - The base filename without extension.
 * @param {string} ext - The desired file extension (e.g., 'pdf', 'jpg', 'png').
 * @param {boolean} FAKEMODE - Whether to use fake scanning.
 */
const scanAndConvert = async (targetDir, filename, ext, FAKEMODE = false) => {
  const fullFilename = `${filename}.${ext}`

  const tempFile = path.join(targetDir, `.scan-js.temp.${ext === 'pdf' ? 'jpg' : ext}`)

  try {
    if (FAKEMODE) {
      info('FAKEMODE enabled. Using preexisting temp file.')
      const fakeTempFile = path.join(scriptDir, 'fake_temp.jpg')
      if (!fs.existsSync(fakeTempFile)) {
        throw new Error(`Fake temp file does not exist at ${fakeTempFile}`)
      }
      await execAsync(`cp "${fakeTempFile}" "${tempFile}"`)
    } else { // REAL MODE
      await execAsync(`rm -f "${tempFile}"`)
      info(`temporary file '${tempFile}' removed.`)
      if (ext === 'pdf') {
        // Scan as JPEG for PDF conversion
        await execAsync(
          `scanimage --verbose -p --resolution 300 --mode Color --format=jpeg -x 210 -y 297 > "${tempFile}"`
        )
      } else {
        // Scan directly as JPG or PNG
        await execAsync(
          `scanimage --verbose -p --resolution 300 --mode Color --format=${ext === 'jpg' ? 'jpeg' : ext} -x 210 -y 297 > "${tempFile}"`
        )
      }
      info('Scanning completed', FAKEMODE ? 'FAKEMODE' : '(real mode)')
    }

    if (ext === 'pdf') {
      // Convert JPEG to PDF
      await execAsync(`convert "${tempFile}" -quality 75 -level 20%,90% "${fullFilename}"`)
      info('Conversion to PDF completed.')
    } else {
      // For JPG and PNG, no conversion needed
      fs.renameSync(tempFile, fullFilename)
      info('Scan directly saved as', fullFilename)
    }
  } catch (error) {
    console.error('Error during scan and convert:', error)
    throw error // Re-throw to allow upstream handling
  }
}

/**
 * Generates the next available filename in the target directory.
 * @param {string} targetDir - The directory to check for existing files.
 * @param {string} ext - The desired file extension.
 * @returns {string} - The next available filename without extension.
 */
const createNextAvailableDefaultFilename = (targetDir, ext) => {
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
    return [avoidScriptAndHomeDir(currentDir), '']
  }

  if (fs.existsSync(rawPath) && fs.lstatSync(rawPath).isDirectory()) {
    return [rawPath, ''] // here, even a desired homedir is fine
  }

  const possibleDir = path.dirname(rawPath) // would have to be existing dir (empty will be current '.')
  const possibleFileName = path.basename(rawPath) // extract the (future) filename part

  important(`possibleDir: '${possibleDir}'`)
  important(`possibleFileName: '${possibleFileName}'`)

  if (!validFilename.test(possibleFileName)) {
    important(`invalid filename '${possibleFileName}'. Please check the provided path.`)
    process.exit(1) // user error, no ugly stack trace
  }

  if (!fs.existsSync(possibleDir)) { // includes current-dir case `-`
    important(`directory '${possibleDir}' does not exist. Please check the provided path.`)
    process.exit(1) // user error, no ugly stack trace
  }

  return [avoidScriptAndHomeDir(possibleDir), rawPath]
}

/**
 * Main function to handle scanning and file naming.
 */
const scanToFile = () => {
  let openFlag = true
  let FAKEMODE = false
  let multiPage = false
  let numOfPages = 1 // Default is 1 page, 0 := unlimited „keep-asking-mode“
  let outputFormat = 'pdf' // Default output format
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

  // Process magic words from the beginning of args
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
      // Arg is a whole number between 1 and 999
      numOfPages = parseInt(arg, 10)
      multiPage = true
      args.shift()
    } else {
      // Not a magic word, stop processing
      break
    }
  }

  // figure out path from remaining argument(s)
  let [targetDir, suggestedFilename] = getDestination(args)

  suggestedFilename = suggestedFilename.trim()

  if (suggestedFilename === '') {
    suggestedFilename = createNextAvailableDefaultFilename(targetDir, outputFormat)
    promptingNeeded = true
  }

  if (suggestedFilename.toLowerCase().endsWith(`.${outputFormat}`)) {
    info('removing already attached extension if meaning type', suggestedFilename)
    suggestedFilename = suggestedFilename.slice(0, -(`.${outputFormat}`).length)
  }

  const scanFilePath = path.join(targetDir, suggestedFilename)
  const ext = outputFormat

  info(purple(`currentDir: ${currentDir}`))
  info(purple(`homeDir: ${homeDir}`))
  info(purple(`scriptDir: ${scriptDir}`))
  info(purple(`numOfPages: ${numOfPages}`))
  info(purple(`multiPage: ${multiPage}`))
  info(purple(`outputFormat (ext): ${outputFormat} (${ext})`))
  info(green(`targetDir: ${targetDir}`))
  info(green(`suggestedFilename: ${suggestedFilename}`))
  info(purple('↓ ↓ ↓'))
  info(purple(`scanFilePath: '${scanFilePath}'`))

  // start scanning and prompting concurrently (don't waste time while picking names...)
  const scanPromise = scanAndConvert(targetDir, scanFilePath, ext, FAKEMODE)
  // only prompt if no name provided (i.e. nothing or only a path)
  const promptPromise = (promptingNeeded) ? promptForUserFilename(scanFilePath, ext) : Promise.resolve(suggestedFilename)

  Promise.all([promptPromise, scanPromise])
    .then(([finalFilename]) => {
      const sourceFile = `${scanFilePath}.${ext}`
      info(`sourceFile: ${sourceFile}`)

      let targetFile

      if (finalFilename) {
        if (finalFilename.endsWith(`.${ext}`)) {
          targetFile = path.join(targetDir, finalFilename)
        } else {
          targetFile = path.join(targetDir, `${finalFilename}.${ext}`)
        }
      } else {
        targetFile = sourceFile
      }

      if (finalFilename && finalFilename !== path.basename(scanFilePath)) {
        fs.renameSync(sourceFile, targetFile)
        info(`Scan saved and renamed from ${sourceFile} to ${targetFile}`)
      } else {
        info(`Scan directly saved as ${sourceFile}`)
      }

      // finally sanity check
      if (!fs.existsSync(targetFile)) {
        throw new Error(`${targetFile} does not exist`)
      }
      if (fs.statSync(targetFile).size < 10 * 1024) { // > 10kb
        throw new Error(`${targetFile} is smaller than 10KB.`)
      }

      // Open the file if requested
      if (openFlag) {
        info(`Opening ${targetFile}`)
        exec(`xdg-open "${targetFile}"`)
      }
    })
    .catch(err => {
      console.error('An error occurred:', err)
      process.exit(1) // Exit with a non-zero status code
    })
}

scanToFile()
