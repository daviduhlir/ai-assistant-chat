import 'reflect-metadata'
import { ToolSet } from '../components/ToolSet'
import * as pathModule from 'path'

export class FsToolSet extends ToolSet {
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
      return `**Matches for \`${query}\` in \`${path}\`:**\n\n| Line | Column | Content |\n|---|---|---|\n${results.map(r => `| ${r.line} | ${r.column} | \`${r.match}\` |`).join('\n')}`
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
      return `**Matches for \`${query}\` in \`${rootDir}\`:**\n\n| File | Line | Column | Content |\n|---|---|---|---|\n${results.map(r => `| \`${r.file}\` | ${r.line} | ${r.column} | \`${r.match}\` |`).join('\n')}`
    } catch (e: any) {
      return `❌ Error searching in FS \`${rootDir}\`: ${e.message || e}`
    }
  }

  @ToolSet.Callable('Get file or directory stats')
  public async stat(path: string): Promise<string> {
    path = this.normalizePath(path)
    try {
      const stats = await this.fs.stat(path)
      return `**Stats for \`${path}\`:**\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\``
    } catch (e: any) {
      return `❌ Error getting stats for \`${path}\`: ${e.message || e}`
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
}