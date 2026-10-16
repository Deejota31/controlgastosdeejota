import { expect, test } from '@playwright/test'

const RUTAS = ['/', '/movimientos', '/presupuesto', '/catalogo', '/salud', '/planificacion', '/configuracion', '/ui']
const ANCHOS = [320, 375, 768, 1024, 1440, 1920]

test.describe('Fundaciones', () => {
  for (const ancho of ANCHOS) {
    test(`sin scroll horizontal a ${ancho}px en todas las pantallas`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 })
      for (const ruta of RUTAS) {
        await page.goto(`/?demo#${ruta}`)
        await expect(page.locator('h1')).toBeVisible()
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(desborde, `desborde en ${ruta}`).toBeLessThanOrEqual(0)
      }
    })
  }

  test('el tema oscuro se aplica y se recuerda', async ({ page }) => {
    await page.goto('/?demo#/ui')
    await page.getByRole('radio', { name: 'Oscuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('el modal atrapa el foco y cierra con Escape', async ({ page }) => {
    await page.goto('/?demo#/ui')
    await page.getByRole('button', { name: 'Abrir modal' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Nuevo gasto' })
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    await expect(page.getByRole('button', { name: 'Abrir modal' })).toBeFocused()
  })

  test('el catálogo /#/ui no existe fuera de desarrollo y demo', async ({ page }) => {
    await page.goto('/#/ui')
    await expect(page.getByRole('heading', { name: 'Catálogo de componentes' })).toBeVisible() // título de ruta
    await expect(page.getByRole('heading', { name: 'Button / IconButton' })).toHaveCount(0)
  })
})
