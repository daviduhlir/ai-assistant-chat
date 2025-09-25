import 'reflect-metadata'
import { ToolSet } from '../components/ToolSet'
import * as pathModule from 'path'

/**
 *
 * Fs tool set basics
 *
 */
export class FsToolBasicsSet extends ToolSet {
  constructor(readonly fs: typeof import('fs/promises')) {
    super()
  }

  protected normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      return '/' + path
    }
    return path
  }

  @ToolSet.Callable('Reads a file content, returns content as string')
  public async readFile(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      return await this.fs.readFile(path, 'utf8')
    } catch (e: any) {
      return `❌ Error reading file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Reads file content from line "from" to line "to" (inclusive, 1-based)')
  public async readFileRange(path: string, from: number, to: number): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const lines = content.split(/\r?\n/)
      return lines.slice(from - 1, to).join('\n')
    } catch (e: any) {
      return `❌ Error reading file range from \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Get file size in bytes')
  public async getFileSize(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const stats = await this.fs.stat(path)
      return `${stats.size}`
    } catch (e: any) {
      return `❌ Error getting file size for \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Writes content to a file')
  public async writeFile(path: string, content: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      // Ensure parent directory exists
      const parentDir = pathModule.dirname(path)
      if (parentDir && parentDir !== '/') {
        await this.fs.mkdir(parentDir, { recursive: true })
      }
      await this.fs.writeFile(path, content, 'utf8')
      return `✅ File "${path}" written successfully.`
    } catch (e: any) {
      return `❌ Error writing file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Deletes a file')
  public async deleteFile(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      await this.fs.unlink(path)
      return `✅ File "${path}" deleted successfully.`
    } catch (e: any) {
      return `❌ Error deleting file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Lists files in a directory')
  public async listFiles(dir: string): Promise<string> {
    dir = this.normalizePath(dir)
    try {
      // Ensure directory exists, create if it's root
      if (dir === '/') {
        try {
          await this.fs.access(dir)
        } catch {
          await this.fs.mkdir(dir, { recursive: true })
        }
      }
      const files = await this.fs.readdir(dir)
      return files.join('\n') || '(empty directory)'
    } catch (e: any) {
      return `❌ Error listing files in \`${dir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Checks if a file exists')
  public async fileExists(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      await this.fs.access(path)
      return `true`
    } catch {
      return `false`
    }
  }

  @ToolSet.Callable('Search for a string in a file, returns markdown table of matches')
  public async searchInFile(path: string, query: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const lines = content.split(/\r?\n/)
      const results: { line: number; column: number; match: string }[] = []
      lines.forEach((lineText, idx) => {
        let col = lineText.indexOf(query)
        while (col !== -1) {
          results.push({ line: idx + 1, column: col + 1, match: lineText })
          col = lineText.indexOf(query, col + 1)
        }
      })
      if (results.length === 0) return `No matches found for \`${query}\` in \`${path}\`.`
      return `**Matches for \`${query}\` in \`${path}\`:**\n\n| Line | Column | Content |\n|---|---|---|\n${results
        .map(r => `| Line: ${r.line} | Position: ${r.column} | \`${r.match}\` |`)
        .join('\n')}`
    } catch (e: any) {
      return `❌ Error searching in file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Search for a string in all text/code files in a directory tree, returns markdown table of matches')
  public async searchInFS(rootDir: string, query: string): Promise<string> {
    rootDir = this.normalizePath(rootDir)
    const results: { file: string; line: number; column: number; match: string }[] = []
    try {
      async function walk(this: FsToolSet, dir: string) {
        let entries
        try {
          entries = await this.fs.readdir(dir, { withFileTypes: true })
        } catch (e: any) {
          results.push({ file: dir, line: 0, column: 0, match: `❌ Error reading directory: ${e.message || e}` })
          return
        }
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk.call(this, fullPath)
          } else if (entry.isFile() && /\.(txt|md|js|ts|json|css|html|py|java|c|cpp|h|cs|go|rb|php|xml|yml|yaml|sh)$/i.test(entry.name)) {
            try {
              const content = await this.fs.readFile(fullPath, 'utf8')
              const lines = content.split(/\r?\n/)
              lines.forEach((lineText, idx) => {
                let col = lineText.indexOf(query)
                while (col !== -1) {
                  results.push({ file: fullPath, line: idx + 1, column: col + 1, match: lineText })
                  col = lineText.indexOf(query, col + 1)
                }
              })
            } catch (e: any) {
              results.push({ file: fullPath, line: 0, column: 0, match: `❌ Error reading file: ${e.message || e}` })
            }
          }
        }
      }
      await walk.call(this, rootDir)
      if (results.length === 0) return `No matches found for \`${query}\` in \`${rootDir}\`.`
      return `**Matches for \`${query}\` in \`${rootDir}\`:**\n\n| File | Line | Column | Content |\n|---|---|---|---|\n${results
        .map(r => `| \`${r.file}\` | Line: ${r.line} | Position: ${r.column} | \`${r.match}\` |`)
        .join('\n')}`
    } catch (e: any) {
      return `❌ Error searching in FS \`${rootDir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Get file or directory stats, including type and existence')
  public async fsStat(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const stats = await this.fs.stat(path)
      const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other'
      return [
        `**Stats for \`${path}\`:**`,
        '',
        '| Property   | Value |',
        '|------------|-------|',
        `| exists     | true  |`,
        `| type       | ${type} |`,
        `| size       | ${stats.size} |`,
        `| mtime      | ${stats.mtime} |`,
        `| atime      | ${stats.atime} |`,
        `| ctime      | ${stats.ctime} |`,
        `| birthtime  | ${stats.birthtime} |`,
        `| mode       | ${stats.mode} |`,
        `| uid        | ${stats.uid} |`,
        `| gid        | ${stats.gid} |`,
        `| ino        | ${stats.ino} |`,
        `| dev        | ${stats.dev} |`,
      ].join('\n')
    } catch (e: any) {
      return [
        `**Stats for \`${path}\`:**`,
        '',
        '| Property   | Value |',
        '|------------|-------|',
        `| exists     | false |`,
        `| error      | ${e.message || e} |`,
      ].join('\n')
    }
  }

  @ToolSet.Callable('Creates a directory (and its parent directories if needed)')
  public async mkdir(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      await this.fs.mkdir(path, { recursive: true })
      return `✅ Directory "${path}" created successfully.`
    } catch (e: any) {
      return `❌ Error creating directory \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Deletes a directory and all its contents recursively')
  public async deleteFolder(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      await this.fs.rm(path, { recursive: true, force: true })
      return `✅ Directory "${path}" deleted successfully.`
    } catch (e: any) {
      return `❌ Error deleting directory \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Show directory tree structure')
  public async tree(dir: string, depth: number = 2): Promise<string> {
    dir = this.normalizePath(dir)
    try {
      async function walk(this: FsToolSet, d: string, currentDepth: number): Promise<string[]> {
        if (currentDepth > depth) return []
        let entries
        try {
          entries = await this.fs.readdir(d, { withFileTypes: true })
        } catch (e: any) {
          return [`❌ Error reading directory \`${d}\`: ${e.message || e}`]
        }
        let result: string[] = []
        for (const entry of entries) {
          const fullPath = pathModule.join(d, entry.name)
          result.push('  '.repeat(currentDepth) + (entry.isDirectory() ? `📁 ${entry.name}/` : `📄 ${entry.name}`))
          if (entry.isDirectory()) {
            result = result.concat(await walk.call(this, fullPath, currentDepth + 1))
          }
        }
        return result
      }
      const tree = await walk.call(this, dir, 0)
      return `**Directory tree for \`${dir}\`:**\n\n${tree.join('\n')}`
    } catch (e: any) {
      return `❌ Error showing tree for \`${dir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Search and replace a string in all text/code files in a directory tree')
  public async searchAndReplaceInFS(rootDir: string, search: string, replace: string): Promise<string> {
    rootDir = this.normalizePath(rootDir)
    let changedFiles = 0
    let changedCount = 0
    try {
      async function walk(this: FsToolSet, dir: string) {
        let entries
        try {
          entries = await this.fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk.call(this, fullPath)
          } else if (entry.isFile() && /\.(txt|md|js|ts|json|css|html|py|java|c|cpp|h|cs|go|rb|php|xml|yml|yaml|sh)$/i.test(entry.name)) {
            try {
              const content = await this.fs.readFile(fullPath, 'utf8')
              if (content.includes(search)) {
                const replaced = content.split(search).join(replace)
                await this.fs.writeFile(fullPath, replaced, 'utf8')
                changedFiles++
                changedCount += (content.match(new RegExp(search, 'g')) || []).length
              }
            } catch {}
          }
        }
      }
      await walk.call(this, rootDir)
      return `✅ Replaced "${search}" with "${replace}" in ${changedFiles} files, total ${changedCount} replacements.`
    } catch (e: any) {
      return `❌ Error replacing in FS \`${rootDir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Search for a regexp pattern in a file, returns markdown table of matches')
  public async searchInFileRegexp(path: string, pattern: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const re = new RegExp(pattern, 'g')
      const lines = content.split(/\r?\n/)
      const results: { line: number; column: number; match: string }[] = []
      lines.forEach((lineText, idx) => {
        let match
        while ((match = re.exec(lineText)) !== null) {
          results.push({ line: idx + 1, column: match.index + 1, match: match[0] })
        }
        re.lastIndex = 0 // Reset index for next line
      })
      if (results.length === 0) return `No matches found for /${pattern}/ in \`${path}\`.`
      return `**Matches for /${pattern}/ in \`${path}\`:**\n\n| Line | Column | Match |\n|---|---|---|\n${results
        .map(r => `| ${r.line} | ${r.column} | \`${r.match}\` |`)
        .join('\n')}`
    } catch (e: any) {
      return `❌ Error searching in file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Search for a regexp pattern in all text/code files in a directory tree, returns markdown table of matches')
  public async searchInFSRegexp(rootDir: string, pattern: string): Promise<string> {
    rootDir = this.normalizePath(rootDir)
    const results: { file: string; line: number; column: number; match: string }[] = []
    try {
      const re = new RegExp(pattern, 'g')
      async function walk(this: FsToolSet, dir: string) {
        let entries
        try {
          entries = await this.fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk.call(this, fullPath)
          } else if (entry.isFile() && /\.(txt|md|js|ts|json|css|html|py|java|c|cpp|h|cs|go|rb|php|xml|yml|yaml|sh)$/i.test(entry.name)) {
            try {
              const content = await this.fs.readFile(fullPath, 'utf8')
              const lines = content.split(/\r?\n/)
              lines.forEach((lineText, idx) => {
                let match
                while ((match = re.exec(lineText)) !== null) {
                  results.push({ file: fullPath, line: idx + 1, column: match.index + 1, match: match[0] })
                }
                re.lastIndex = 0
              })
            } catch {}
          }
        }
      }
      await walk.call(this, rootDir)
      if (results.length === 0) return `No matches found for /${pattern}/ in \`${rootDir}\`.`
      return `**Matches for /${pattern}/ in \`${rootDir}\`:**\n\n| File | Line | Column | Match |\n|---|---|---|---|\n${results
        .map(r => `| \`${r.file}\` | ${r.line} | ${r.column} | \`${r.match}\` |`)
        .join('\n')}`
    } catch (e: any) {
      return `❌ Error searching in FS \`${rootDir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Replace in file using regexp pattern and replacement (pattern and replacement are string parameters)')
  public async replaceInFileRegexp(path: string, pattern: string, replacement: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const re = new RegExp(pattern, 'g')
      const replaced = content.replace(re, replacement)
      await this.fs.writeFile(path, replaced, 'utf8')
      const count = (content.match(re) || []).length
      return `✅ Replaced pattern /${pattern}/ in \`${path}\` (${count} replacements).`
    } catch (e: any) {
      return `❌ Error replacing in file \`${path}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Search and replace a regexp pattern in all text/code files in a directory tree')
  public async searchAndReplaceInFSRegexp(rootDir: string, pattern: string, replacement: string): Promise<string> {
    rootDir = this.normalizePath(rootDir)
    let changedFiles = 0
    let changedCount = 0
    try {
      const re = new RegExp(pattern, 'g')
      async function walk(this: FsToolSet, dir: string) {
        let entries
        try {
          entries = await this.fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk.call(this, fullPath)
          } else if (entry.isFile() && /\.(txt|md|js|ts|json|css|html|py|java|c|cpp|h|cs|go|rb|php|xml|yml|yaml|sh)$/i.test(entry.name)) {
            try {
              const content = await this.fs.readFile(fullPath, 'utf8')
              if (re.test(content)) {
                const replaced = content.replace(re, replacement)
                await this.fs.writeFile(fullPath, replaced, 'utf8')
                changedFiles++
                changedCount += (content.match(re) || []).length
              }
            } catch {}
          }
        }
      }
      await walk.call(this, rootDir)
      return `✅ Replaced pattern /${pattern}/ with "${replacement}" in ${changedFiles} files, total ${changedCount} replacements.`
    } catch (e: any) {
      return `❌ Error replacing in FS \`${rootDir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable(`
    Highlight lines around a search string in a file,
    returns markdown with context, highlighted line starts with > ,
    context is configurable by linesBefore and linesAfter (how much lines before and after),
    occurrence is configurable (which occurrence to show starting from 1)
  `)
  public async searchInFileWithContext(path: string, query: string, linesBefore: number = 5, linesAfter: number = 5, occurrence: number = 1): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const lines = content.split(/\r?\n/)
      const results: { line: number; contextLines: string[]; contextLineNumbers: number[] }[] = []
      lines.forEach((lineText, idx) => {
        if (lineText.includes(query)) {
          const start = Math.max(0, idx - linesBefore)
          const end = Math.min(lines.length, idx + linesAfter + 1)
          results.push({
            line: idx + 1,
            contextLines: lines.slice(start, end),
            contextLineNumbers: Array.from({length: end - start}, (_, i) => start + i + 1)
          })
        }
      })
      if (results.length === 0) return `No matches found for \`${query}\` in \`${path}\`.`
      if (occurrence < 1 || occurrence > results.length) return `Only ${results.length} matches found for \`${query}\` in \`${path}\`, cannot show occurrence #${occurrence}.`;
      const r = results[occurrence - 1]
      const contextTable = r.contextLines.map((line, i) => `${r.contextLineNumbers[i] === r.line ? '> ' : '  '}${r.contextLineNumbers[i]}: ${line}`).join('\n')
      return [
        `**Total matches:** ${results.length}`,
        `**Showing occurrence:** ${occurrence} (at line ${r.line})`,
        '',
        '```',
        contextTable,
        '```'
      ].join('\n')
    } catch (e: any) {
      return `❌ Error highlighting in file \`${path}\`: ${e.message || e}`
    }
  }
}

/**
 * Working with lines
 *
 * Sometimes AI struggles to count lines, so thats why it's optional
 */

export class FsLinesToolSet extends ToolSet {
  constructor(readonly fs: typeof import('fs/promises')) {
    super()
  }

  protected normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      return '/' + path
    }
    return path
  }

  @ToolSet.Callable('Replace lines in a file in a given range (start and end are inclusive, 1-based)')
  public async changeLines(path: string, start: number, end: number, newContent: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const content = await this.fs.readFile(path, 'utf8')
      const lines = content.split(/\r?\n/)
      const newLines = newContent.split(/\r?\n/)
      lines.splice(start - 1, end - start + 1, ...newLines)
      await this.fs.writeFile(path, lines.join('\n'), 'utf8')
      return `✅ Lines ${start}-${end} in \`${path}\` replaced.`
    } catch (e: any) {
      return `❌ Error replacing lines in \`${path}\`: ${e.message || e}`
    }
  }
}

/**
 *
 * Fs tool set complete
 *
 */

export class FsToolSet extends ToolSet {
  constructor(readonly fs: typeof import('fs/promises'), includeLinesTools?: boolean) {
    super([new FsToolBasicsSet(fs), ...(includeLinesTools ? [new FsLinesToolSet(fs)] : [])])
  }
}