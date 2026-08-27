import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TUTORIALS, findTutorial } from '../src/renderer/tutorials/catalogue'

/** Every `data-tutorial-id` value present in the renderer source. */
function declaredTargets(): Set<string> {
  const found = new Set<string>()
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!entry.name.endsWith('.tsx') && !entry.name.endsWith('.ts')) continue
      for (const match of readFileSync(path, 'utf8').matchAll(/data-tutorial-id="([^"]+)"/g)) {
        found.add(match[1])
      }
    }
  }
  walk('src/renderer')
  return found
}

describe('tutorial catalogue', () => {
  it('points every step at a target that exists in the interface', () => {
    const targets = declaredTargets()
    for (const tutorial of TUTORIALS) {
      for (const step of tutorial.steps) {
        if (!step.target) continue
        expect(targets, `${tutorial.id}/${step.id} targets "${step.target}"`).toContain(step.target)
      }
    }
  })

  it('gives highlight and action steps something to point at', () => {
    for (const tutorial of TUTORIALS) {
      for (const step of tutorial.steps) {
        if (step.type === 'highlight' || step.type === 'action') {
          expect(step.target, `${tutorial.id}/${step.id}`).toBeTruthy()
        }
      }
    }
  })

  it('ends each tutorial on a completion step', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorial.steps.at(-1)?.type, tutorial.id).toBe('completion')
    }
  })

  it('keeps tutorial and step identifiers unique', () => {
    const ids = TUTORIALS.map((tutorial) => tutorial.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tutorial of TUTORIALS) {
      const stepIds = tutorial.steps.map((step) => step.id)
      expect(new Set(stepIds).size, tutorial.id).toBe(stepIds.length)
    }
  })

  it('offers exactly one starting point', () => {
    expect(TUTORIALS.filter((tutorial) => tutorial.startHere)).toHaveLength(1)
  })

  it('looks tutorials up by id', () => {
    expect(findTutorial('first-video')?.title).toBe('Make Your First Video')
    expect(findTutorial('nope')).toBeNull()
  })
})
