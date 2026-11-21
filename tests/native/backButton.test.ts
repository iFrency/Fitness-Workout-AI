import { createBackRouter } from '../../src/native/backButton'

function setup() {
  const go = vi.fn()
  const exit = vi.fn()
  return { router: createBackRouter(), go, exit }
}

it('exits the app from the home page', () => {
  const { router, go, exit } = setup()
  router.handle('home', go, exit)
  expect(exit).toHaveBeenCalledTimes(1)
  expect(go).not.toHaveBeenCalled()
})

it.each(['preview', 'done'] as const)('goes back home from %s', page => {
  const { router, go, exit } = setup()
  router.handle(page, go, exit)
  expect(go).toHaveBeenCalledWith('home')
  expect(exit).not.toHaveBeenCalled()
})

it('never leaves the training page without its own handler', () => {
  const { router, go, exit } = setup()
  router.handle('training', go, exit)
  expect(go).not.toHaveBeenCalled()
  expect(exit).not.toHaveBeenCalled()
})

it('lets the most recently registered handler take the press', () => {
  const { router, go, exit } = setup()
  const outer = vi.fn()
  const inner = vi.fn()
  router.push(outer)
  const removeInner = router.push(inner)
  router.handle('home', go, exit)
  expect(inner).toHaveBeenCalledTimes(1)
  expect(outer).not.toHaveBeenCalled()
  removeInner()
  router.handle('home', go, exit)
  expect(outer).toHaveBeenCalledTimes(1)
  expect(exit).not.toHaveBeenCalled()
})

it('removing a handler twice or out of order removes only that handler', () => {
  const { router, go, exit } = setup()
  const a = vi.fn()
  const b = vi.fn()
  const removeA = router.push(a)
  router.push(b)
  removeA(); removeA()
  router.handle('home', go, exit)
  expect(b).toHaveBeenCalledTimes(1)
  expect(a).not.toHaveBeenCalled()
})
