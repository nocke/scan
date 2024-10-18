# scan

**a handy little command line scan tool!**

I wrote this litte command line tool in nodejs, to get my weekly burecratic cruft of my desk and into my harddisk faster. No need to open a GUI, then wait to initialize, then think about scanner settings, then go for the save dialog every time...

* Scans an A4 page (default scanner) to a path of your liking
* Contrast enhancement (Histogram clamp: 10%-90%)
  (also helps reduce filesize if white is truly white)
* Filename by command line or prompted
* scanning will happen while you determine your filename (=no time lost \o/)
* Command-Line paths ensured to exist
* Also scans to jpg and png
* Lenient if you forget quotes around your path (concatenates)
* generated file sanitychecked ≥ 10 kb
* generated file opened in default pdf viewer

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
Some folder magic applied: If you do not explictly provide a folder, and current Dir happens to be the script location or home (which will be the likely case if you run if from the linux run prompt (alt-F2, Win-R,...), file will end up in `~/Pictures/scan` (to rename and move to the appropriate place from there).


    ~ $> scan

being in your home folder, this scans → `~/Pictures/scan/YYYY-MM-DD scan 01.pdf`

…or `…02.pdf`, `…03.pdf`, until something is not taken. Rename thereafter

    ~/someFolder $> scan

being in any otherfolder, this scans → `~/someFolder/2024-10-16 scan 01`. Same name collision avoidance as above.

Of course, you can also provide a folder path:

    ~/wherever $> scan /depot/existingFolder

scans → `/depot/existingFolder/2024-10-16 scan 01`

    ~/wherever $> scan /depot/nonExistingName

scans → `/depot/nonExistingName.pdf`

If no folder exists, assumed to be the would-be filename (extension added if needed, and path leading there verified. To save you from accidental folder generation by typos.) No prompting for filename in this case, because you just gave one 👍

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

* multi-page mode (with leading int as “magic word” resp. integer number all for „keep asking mode“)
* allow for [actual file dialog](https://help.gnome.org/users/zenity/stable/file-selection.html.en) (with all the navigation benefits including 'favorites' of that)
* jpg and png mode not just by magicword but also by virtue of giving a filename with extension
* verbose mode (requires logLevel in @nocke/util)

### LICENSE

MIT LIcense, see [LICENSE](./LICENSE)
