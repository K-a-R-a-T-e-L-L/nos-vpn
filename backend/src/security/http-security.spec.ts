import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import express = require('express')
import request = require('supertest')

import { createHttpSecurityMiddleware } from './http-security'

describe('HTTP security headers', () => {
    it('applies Helmet API-safe defaults including CSP outside Swagger UI mode', async () => {
        const app = express()
        app.use(createHttpSecurityMiddleware(false))
        app.get('/api/health', (_request, response) => {
            response.json({ ok: true })
        })

        const response = await request(app).get('/api/health').expect(200)

        expect(response.headers['content-security-policy']).toBeDefined()
        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
        expect(response.body).toEqual({ ok: true })
    })

    it('disables only CSP when Swagger UI is enabled and keeps the other protections', async () => {
        const app = express()
        app.use(createHttpSecurityMiddleware(true))
        app.get('/api-docs', (_request, response) => {
            response.type('html').send('<html>swagger</html>')
        })

        const response = await request(app).get('/api-docs').expect(200)

        expect(response.headers['content-security-policy']).toBeUndefined()
        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    })

    it('registers Helmet before body parsers and routes in the application bootstrap', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')
        const helmetRegistration = source.indexOf('app.use(createHttpSecurityMiddleware(enableSwagger))')
        const firstBodyParser = source.indexOf('express.json(')

        expect(helmetRegistration).toBeGreaterThan(-1)
        expect(firstBodyParser).toBeGreaterThan(helmetRegistration)
    })
})
