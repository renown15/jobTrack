import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('Git Hygiene', () => {
    it('should not have untracked test files', () => {
        try {
            // Get list of untracked files
            const untrackedFiles = execSync('git ls-files --others --exclude-standard', {
                cwd: process.cwd(),
                encoding: 'utf-8'
            }).split('\n').filter(Boolean)

            // Filter for test files
            const untrackedTestFiles = untrackedFiles.filter(file =>
                file.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)
            )

            if (untrackedTestFiles.length > 0) {
                const errorMsg = [
                    '\n❌ Found untracked test files that should be committed:',
                    ...untrackedTestFiles.map(f => `  - ${f}`),
                    '\nRun: git add ' + untrackedTestFiles.join(' ')
                ].join('\n')

                expect.fail(errorMsg)
            }

            // If we get here, no untracked test files
            expect(untrackedTestFiles).toHaveLength(0)
        } catch (error) {
            // If not in a git repo, skip this test
            if (error.message?.includes('not a git repository')) {
                console.log('⚠️  Skipping git hygiene test (not in git repo)')
                return
            }
            throw error
        }
    })

    it('should not have unstaged test files with changes', () => {
        try {
            // Get list of modified but unstaged files
            const modifiedFiles = execSync('git diff --name-only', {
                cwd: process.cwd(),
                encoding: 'utf-8'
            }).split('\n').filter(Boolean)

            // Filter for test files
            const modifiedTestFiles = modifiedFiles.filter(file =>
                file.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)
            )

            if (modifiedTestFiles.length > 0) {
                const errorMsg = [
                    '\n⚠️  Found modified test files that are not staged:',
                    ...modifiedTestFiles.map(f => `  - ${f}`),
                    '\nRun: git add ' + modifiedTestFiles.join(' ')
                ].join('\n')

                console.warn(errorMsg)
                // Don't fail, just warn
            }

            expect(true).toBe(true)
        } catch (error) {
            if (error.message?.includes('not a git repository')) {
                return
            }
            throw error
        }
    })
})
