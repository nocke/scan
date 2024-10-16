# scan

**a handy little command line scan tool!**

* Scans an A4 page (default scanner) to a path of your liking
* Contrast enhancement (Histogram clamp: 10%-90%)
  (also helps reduce filesize if white is truly white)
* Filename by command line or prompted (Zenity) while you scan (no time lost \o/)
* Also scan to jpg and png
* Lenient if you forget quotes around your path (concatenates)
* All kinds of sanity checks

### Usage: `scan [magicwords] [path]`

    Options:
      close         Do not open the output file after scanning
      fake          Use fake (dry-run) scanning mode (for development)
      jpg           Output as JPEG
      png           Output as PNG
    Examples:
      scan open /path/to/directory
      scan fake jpg "/path/to/filename"
      scan png all "/path/to/filename"

### path 'magic'
Some folder magic applied: If you do not explictly provide a folder, and current Dir happens to be the script location or home (which will be the likely case if you run if from the linux run prompt (alt-F2, Win-R,...), file will end up in `~/Pictures/scan` (for further sorting).


    ~ $> scan

scans → `~/Pictures/scan/YYYY-MM-DD scan 01.pdf`

…or `…02.pdf`, `…03.pdf`, until something is not taken. Rename thereafter

    ~/someFolder $> scan

scans → `~/someFolder/2024-10-16 scan 01`

same name collision avoidance

    ~/wherever $> scan /depot/existingFolder

scans → `/depot/existingFolder/2024-10-16 scan 01`

    ~/wherever $> scan /depot/nonExistingName

scans → `/depot/nonExistingName.pdf`

if no folder exists, assumed to be the would-be filename (extension added if needed)
No prompting for filename in this case, because you just gave one 👍

Ruthless lowercasing of extension. (No `.PDF`. `.Pdf` ever.)

### Notes

`scan` is a bash “convenience wrapper” (passes call through to _scan.js). So that you can simply type `scan` (despite all shebangs node still wants to have a `.js` extension.)

Rename if you think, `scan` is taken on your machine. (surprisingly it was not on mine)


### linux package dependencies

    sudo apt install sane-utils

to have `scanimage` (using the default scanner, I am not influencing any of that). Works for me with a Epson ET-2750.

    sudo apt install imagemagick

to use `convert`

### TODO

* clean up `.scan-js.temp.jpg`
* multi-page mate (with leading int as “magic word” resp. all for „keep asking mode“)
* allow for actual file prompt (nice to use 'favorites' that come with that, too)

### LICENSE

MIT LIcense, see [LICENSE](./LICENSE)
