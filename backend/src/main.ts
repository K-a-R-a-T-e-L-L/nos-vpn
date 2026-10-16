import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { useContainer } from 'class-validator'
import * as cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import * as express from 'express'

import { AppModule } from './app.module'
import { AllExceptionsFilter } from './logger/all-exceptions.filter'
import { TelegramLoggerService } from './logger/logger.service'
import { createHttpSecurityMiddleware } from './security/http-security'

async function bootstrap() {
    config()
    const frontendOrigin = process.env.FRONTEND_ORIGIN
    if (!frontendOrigin) {
        throw new Error('FRONTEND_ORIGIN is required')
    }

    const enableSwagger =
        process.env.ENABLE_SWAGGER === 'true' ||
        (process.env.ENABLE_SWAGGER !== 'false' && process.env.NODE_ENV !== 'production')

    const normalizedFrontendOrigin = frontendOrigin.replace(/\/+$/, '')
    const corsOrigins = new Set<string>([normalizedFrontendOrigin])
    if (normalizedFrontendOrigin.includes('localhost')) {
        corsOrigins.add(normalizedFrontendOrigin.replace('localhost', '127.0.0.1'))
    }
    if (normalizedFrontendOrigin.includes('127.0.0.1')) {
        corsOrigins.add(normalizedFrontendOrigin.replace('127.0.0.1', 'localhost'))
    }

    const app = await NestFactory.create(AppModule, {
        cors: {
            origin: Array.from(corsOrigins),
            credentials: true,
        },
        bodyParser: false,
        logger: ['log', 'warn', 'error'],
    })
    app.use(createHttpSecurityMiddleware(enableSwagger))
    app.use(
        express.json({
            verify: (req: any, _res, buf) => {
                req.rawBody = Buffer.from(buf)
            },
        }),
    )
    app.use(
        express.urlencoded({
            extended: true,
            verify: (req: any, _res, buf) => {
                req.rawBody = Buffer.from(buf)
            },
        }),
    )

    // Compatibility for the currently deployed frontend build, which can call
    // email auth endpoints without the global /api prefix. Keep the canonical
    // Nest routes under /api and transparently route only these public aliases.
    const legacyEmailAuthRoutes = new Set(['/user/register', '/user/login'])
    app.use((req, _res, next) => {
        if (req.method === 'POST') {
            const pathname = req.url.split('?', 1)[0]
            if (legacyEmailAuthRoutes.has(pathname)) {
                req.url = `/api${req.url}`
            }
        }
        next()
    })

    app.setGlobalPrefix('api')
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            transformOptions: { enableImplicitConversion: true },
            whitelist: true,
        }),
    )
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
    app.useGlobalFilters(new AllExceptionsFilter(app.get(TelegramLoggerService)))
    useContainer(app.select(AppModule), { fallbackOnErrors: true })
    app.use(cookieParser())

    if (enableSwagger) {
        const configSwagger = new DocumentBuilder()
            .setTitle('VPN Backend API')
            .setDescription('VPN backend API for Telegram bot, subscriptions, payments, and VPN access')
            .setVersion('1.0')
            .addBearerAuth()
            .build()
        const document = SwaggerModule.createDocument(app, configSwagger)
        SwaggerModule.setup('api-docs', app, document)
    }

    const port = Number(process.env.PORT || 3200)
    await app.listen(port)
    app.get(TelegramLoggerService).warn(`Server started on port ${port}`, 'Bootstrap')
}

bootstrap()
