# A cloud file syncer for Obsidian.

## Known bugs

- If there are multiple files with overlapping file paths then it is a race to see who reads and writes first.

- For encrpytion only the file data is encrypted. The size, modification and creation time, full file name, and other metadata is stored in plain text.

- Some bug around modified time when download from cloud

- weird issues with markdown files existing in the .obsidian folder.
