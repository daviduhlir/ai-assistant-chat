import { expect } from 'chai'
import { FsToolBasicsSet } from '../lib/ToolSets/FsToolSet'
import { vol } from 'memfs'

describe('FsToolBasicsSet.searchInFileWithContext (memfs)', () => {
  const testFile = '/testfile.txt'
  let toolset: FsToolBasicsSet
  let memfs: any

  beforeEach(async () => {
    vol.reset()
    memfs = require('memfs').promises
    toolset = new FsToolBasicsSet(memfs)
    await memfs.writeFile(testFile, 'A\nfoo\nB\nfoo\nC\nfoo\nD\nE')
  })

  it('returns context for first occurrence', async () => {
    const result = await toolset.searchInFileWithContext(testFile, 'foo', 2, 2, 1)
    expect(result).to.include('**Total matches:** 3')
    expect(result).to.include('**Showing occurrence:** 1 (at line 2)')
    expect(result).to.include('  1: A')
    expect(result).to.include('> 2: foo')
    expect(result).to.include('  3: B')
  })

  it('returns context for second occurrence', async () => {
    const result = await toolset.searchInFileWithContext(testFile, 'foo', 2, 2, 2)
    expect(result).to.include('**Total matches:** 3')
    expect(result).to.include('**Showing occurrence:** 2 (at line 4)')
    expect(result).to.include('  3: B')
    expect(result).to.include('> 4: foo')
    expect(result).to.include('  5: C')
  })

  it('returns context for third occurrence', async () => {
    const result = await toolset.searchInFileWithContext(testFile, 'foo', 2, 2, 3)
    expect(result).to.include('**Total matches:** 3')
    expect(result).to.include('**Showing occurrence:** 3 (at line 6)')
    expect(result).to.include('  4: foo')
    expect(result).to.include('  5: C')
    expect(result).to.include('> 6: foo')
    expect(result).to.include('  7: D')
    expect(result).to.include('  8: E')
  })

  it('returns error for out-of-range occurrence', async () => {
    const result = await toolset.searchInFileWithContext(testFile, 'foo', 2, 2, 4)
    expect(result).to.match(/Only 3 matches found/)
  })

  it('returns error for no match', async () => {
    const result = await toolset.searchInFileWithContext(testFile, 'bar', 2, 2, 1)
    expect(result).to.match(/No matches found/)
  })
})
