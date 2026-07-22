import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch } from '../setup/fixtures'
import { getBranchName } from '@/lib/branches/getBranchName'

describe('getBranchName', () => {
  let branchId: string

  beforeAll(async () => {
    await resetEmulator()
    const branch = await seedBranch('LFD Services — Downtown Branch')
    branchId = branch.id
  })

  it('resolves a real branch id to its name', async () => {
    expect(await getBranchName(branchId)).toBe('LFD Services — Downtown Branch')
  })

  it('falls back to the raw id when the branch does not exist', async () => {
    expect(await getBranchName('does-not-exist')).toBe('does-not-exist')
  })
})
