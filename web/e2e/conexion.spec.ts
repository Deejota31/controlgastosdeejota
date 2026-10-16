import { expect, test } from '@playwright/test'

test.describe('Conexión y demo', () => {
  test('"Conectar mi hoja" abre el formulario con foco en la URL', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Conectar mi hoja' }).click()
    await expect(page.getByLabel('URL de la aplicación web de Apps Script')).toBeFocused()
    await page.getByLabel('URL de la aplicación web de Apps Script').fill('https://example.com/nada')
    await page.getByRole('button', { name: 'Probar y conectar' }).click()
    await expect(page.getByText('La URL debe ser de script.google.com', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('dj.conexion.v1'))).toBeNull()
  })

  test('"Probar en modo demo" carga Inicio con datos y permite salir', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Probar en modo demo' }).click()
    await expect(page.getByText('Movimientos en total')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Estás en modo demo/)).toBeVisible()
    await page.getByRole('button', { name: 'Salir de la demo' }).click()
    await expect(page.getByRole('heading', { name: 'Conecta tu hoja para empezar' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('dj.conexion.v1'))).toBeNull()
  })

  test('?demo=60 muestra datos sembrados sin tocar localStorage', async ({ page }) => {
    await page.goto('/?demo=60#/')
    await expect(page.getByText('Últimos movimientos')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('ul li').first()).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('dj.conexion.v1'))).toBeNull()
  })
})
