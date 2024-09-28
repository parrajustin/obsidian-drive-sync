# A cloud file syncer for Obsidian.

## How to commit

- Write commit messages according to https://www.conventionalcommits.org/en/v1.0.0/
- commit release

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## Known bugs

- If there are multiple files with overlapping file paths then it is a race to see who reads and writes first.

- For encrpytion only the file data is encrypted. The size, modification and creation time, full file name, and other metadata is stored in plain text.

- if you move selected files to filereed file path it will still be synced.
