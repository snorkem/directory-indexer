# Directory Indexer

**A searchable catalog of any drive or folder that opens in a web browser, on any computer.**

Point Directory Indexer at a hard drive, an archive or a network share, and it creates an index of every file on it: names, folders, sizes and dates. The index is an ordinary web page. Anyone can open it in Chrome, Safari, Firefox or Edge, on a Mac, PC or Linux machine, with nothing to install. They don't need a copy of this tool, a special viewer or a software license.

Use it to see what's on a drive while it sits on a shelf, to hand a client a list of what you delivered, or to keep a record of an archive long after the drive is gone.

## What you get

- **Search** every file by name as you type, and filter by file type
- **Browse** the folder tree, with the size and file count of every folder
- **Sort** by name, folder, size, type or date
- **Statistics**: the most common file types, the biggest files and the most recently changed ones

Everything works offline. The index is a snapshot, so it still opens after the drive is unplugged, reformatted or lost.

## Making an index

You need Python 3 and nothing else.

```bash
python directory_indexer.py /Volumes/MyDrive
```

This scans the drive and saves the index in a new folder inside it, named after the drive and the date, for example `index_MyDrive_20251028_143022`.

To save it somewhere else, add a folder or file name:

```bash
python directory_indexer.py /Volumes/MyDrive ~/Desktop
python directory_indexer.py /Volumes/MyDrive ~/Desktop/my-drive.html
```

## Opening an index

**Most drives (under 200,000 files):** the index is a single `.html` file. Double-click it, or email it, share it or copy it anywhere. It opens in any browser.

**Very large drives (200,000 files or more):** a single page would get too big for a browser, so the tool creates a folder instead. The file list goes in a small database next to the page. To open it, double-click the launcher for your system:

| System | Launcher |
|---|---|
| Mac | `macOS/start-viewer.command` |
| Windows | `Windows/start-viewer.bat` |
| Linux | `Linux/start-viewer.sh` |

The launcher opens the index in your browser. Leave its window open while you browse, then close it when you're done. To share this kind of index, zip the whole folder and send that. The person you send it to needs Python 3 installed to run the launcher.

The tool chooses between the two formats automatically. To choose yourself, add `--json` for a single file or `--extdb` for the folder-and-database version.

## Troubleshooting

- **The page is very slow or won't load:** the drive has too many files for a single page. Run the tool again with `--extdb`.
- **"Failed to load database":** you opened `index.html` directly. Use the launcher instead.
- **Scanning is slow:** network drives and old spinning disks take longest. Indexing one project folder instead of a whole drive is faster and gives a tidier index.
- **Some folders are missing:** folders the tool isn't allowed to read are skipped. Check their permissions.
