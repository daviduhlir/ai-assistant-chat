import { expect } from 'chai'
import { FsLinesToolSet, FsToolBasicsSet } from '../dist/ToolSets/FsToolSet'
import { vol } from 'memfs'


describe('FstoolsetLines.changeLines (memfs)', () => {
  const testFile = '/testfile.txt'
  let toolsetBasic: FsToolBasicsSet
  let toolsetLines: FsLinesToolSet
  let memfs: any

  beforeEach(async () => {
    vol.reset()
    memfs = require('memfs').promises
    toolsetBasic = new FsToolBasicsSet(memfs)
    toolsetLines = new FsLinesToolSet(memfs)
    await memfs.writeFile(testFile, 'A\nB\nC\nD\nE')
  })

  it('replaces a range of lines with fewer lines', async () => {
    // Replace lines 2-5 (B, C, D, E) with just two lines
    const result = await toolsetLines.changeLines(testFile, 2, 5, 'X\nY')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nX\nY')
    expect(result).to.match(/replaced/)
  })

  it('replaces a single line with multiple lines', async () => {
    const result = await toolsetLines.changeLines(testFile, 3, 3, 'X\nY\nZ')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nB\nX\nY\nZ\nD\nE')
    expect(result).to.match(/replaced/)
  })

  it('replaces a single line (start == end)', async () => {
    const result = await toolsetLines.changeLines(testFile, 2, 2, 'X')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nX\nC\nD\nE')
    expect(result).to.match(/replaced/)
  })

  it('inserts between lines (start == end+1)', async () => {
    const result = await toolsetLines.changeLines(testFile, 3, 2, 'Y')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nB\nY\nC\nD\nE')
    expect(result).to.match(/replaced/)
  })

  it('replaces multiple lines', async () => {
    const result = await toolsetLines.changeLines(testFile, 2, 4, 'M\nN')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nM\nN\nE')
    expect(result).to.match(/replaced/)
  })

  it('inserts at the beginning (start == 1, end == 0)', async () => {
    const result = await toolsetLines.changeLines(testFile, 1, 0, 'Z')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('Z\nA\nB\nC\nD\nE')
    expect(result).to.match(/replaced/)
  })

  it('inserts at the end (start == end == len+1)', async () => {
    const result = await toolsetLines.changeLines(testFile, 6, 5, 'Q')
    const content = await memfs.readFile(testFile, 'utf8')
    expect(content).to.equal('A\nB\nC\nD\nE\nQ')
    expect(result).to.match(/replaced/)
  })

  it('searchInFile returns correct line and column for matches', async () => {
    await memfs.writeFile(testFile, 'foo bar\nbar foo\nfoofoo\nbar')
    const result = await toolsetBasic.searchInFile(testFile, 'foo')
    // Should find foo at (1,1), (2,5), (3,1), (3,4)
    expect(result).to.include('| Line: 1 | Position: 1 | `foo bar` |')
    expect(result).to.include('| Line: 2 | Position: 5 | `bar foo` |')
    expect(result).to.include('| Line: 3 | Position: 1 | `foofoo` |')
    expect(result).to.include('| Line: 3 | Position: 4 | `foofoo` |')
    expect(result).to.not.include('| 4 | 1 | `bar` |')
  })

  it('searchInFS finds matches in multiple files', async () => {
    const file1 = '/a.txt'
    const file2 = '/b.txt'
    await memfs.writeFile(file1, 'foo\nbar\nfoo')
    await memfs.writeFile(file2, 'bar\nfoo bar')
    const result = await toolsetBasic.searchInFS('/', 'foo')
    expect(result).to.include('| `/a.txt` | Line: 1 | Position: 1 | `foo` |')
    expect(result).to.include('| `/a.txt` | Line: 3 | Position: 1 | `foo` |')
    expect(result).to.include('| `/b.txt` | Line: 2 | Position: 1 | `foo bar` |')
    // Should not include bar-only lines
    expect(result).to.not.include('| `/a.txt` | Line: 2 | Position: 1 | `bar` |')
    expect(result).to.not.include('| `/b.txt` | Line: 1 | Position: 1 | `bar` |')
  })

  it('listFiles returns all files in a directory', async () => {
    await memfs.mkdir('/dir')
    await memfs.writeFile('/dir/a.txt', 'A')
    await memfs.writeFile('/dir/b.txt', 'B')
    await memfs.mkdir('/dir/sub')
    await memfs.writeFile('/dir/sub/c.txt', 'C')
    const result = await toolsetBasic.listFiles('/dir')
    expect(result.split('\n')).to.include.members(['a.txt', 'b.txt', 'sub'])
  })

  it('tree returns correct directory structure', async () => {
    await memfs.mkdir('/root')
    await memfs.writeFile('/root/a.txt', 'A')
    await memfs.mkdir('/root/dir1')
    await memfs.writeFile('/root/dir1/b.txt', 'B')
    await memfs.mkdir('/root/dir2')
    await memfs.writeFile('/root/dir2/c.txt', 'C')
    const result = await toolsetBasic.tree('/root', 2)
    expect(result).to.include('📄 a.txt')
    expect(result).to.include('📁 dir1/')
    expect(result).to.include('📄 b.txt')
    expect(result).to.include('📁 dir2/')
    expect(result).to.include('📄 c.txt')
  })

  it('searchAndReplaceInFS replaces all occurrences in all files', async () => {
    await memfs.writeFile('/a.txt', 'foo bar\nfoo')
    await memfs.writeFile('/b.txt', 'bar foo bar')
    const result = await toolsetBasic.searchAndReplaceInFS('/', 'foo', 'baz')
    const a = await memfs.readFile('/a.txt', 'utf8')
    const b = await memfs.readFile('/b.txt', 'utf8')
    expect(a).to.equal('baz bar\nbaz')
    expect(b).to.equal('bar baz bar')
    expect(result).to.match(/Replaced "foo" with "baz" in 2 files, total 3 replacements/)
  })

  it('replaceInFileRegexp replaces all regex matches in a file', async () => {
    await memfs.writeFile('/c.txt', 'abc123 abc456 abc789')
    const result = await toolsetBasic.replaceInFileRegexp('/c.txt', 'abc\\d+', 'X')
    const c = await memfs.readFile('/c.txt', 'utf8')
    expect(c).to.equal('X X X')
    expect(result).to.equal("✅ Replaced pattern /abc\\d+/ in `/c.txt` (3 replacements).")
  })
})
