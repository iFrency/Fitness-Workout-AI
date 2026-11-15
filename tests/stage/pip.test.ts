import { insetRects, viewOrder } from '../../src/stage/pip'

it('tapping an inset selects that view', async () => {
  const { render, screen } = await import('@testing-library/react')
  const { createElement } = await import('react')
  const { InsetButtons } = await import('../../src/stage/Stage')
  const onSelect = vi.fn()
  render(createElement(InsetButtons, { rects: insetRects(400, 600), preset: 'threeQuarter', onSelect }))
  screen.getByRole('button', { name: '切换到正面视角' }).click()
  expect(onSelect).toHaveBeenCalledWith('front')
  expect(screen.getByRole('button', { name: '切换到侧面视角' })).toHaveStyle({ left: '278px', bottom: '10px' })
}, 20_000) // importing the three.js stage takes over 5 s when the full suite runs in parallel

it('places two 3:4 insets in the bottom corners at 28% of the stage width', () => {
  const [left, right] = insetRects(400, 600)
  expect(left).toEqual({ x: 10, y: 10, width: 112, height: 149 })
  expect(right).toEqual({ x: 278, y: 10, width: 112, height: 149 })
})

it('keeps insets within 40% of the stage height on wide stages', () => {
  const [left] = insetRects(1000, 300)
  expect(left.height).toBe(120)
  expect(left.width).toBe(90)
})

it('orders views: the main one plus the other two as insets, front on the left', () => {
  expect(viewOrder('threeQuarter')).toEqual({ main: 'threeQuarter', insets: ['front', 'side'] })
  expect(viewOrder('front')).toEqual({ main: 'front', insets: ['threeQuarter', 'side'] })
  expect(viewOrder('side')).toEqual({ main: 'side', insets: ['threeQuarter', 'front'] })
})
