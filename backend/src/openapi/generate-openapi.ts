import { writeFile } from 'fs/promises'
import { resolve } from 'path'

import { ApplicationConfig } from '@nestjs/core/application-config'
import { NestContainer } from '@nestjs/core/injector/container'
import { NoopGraphInspector } from '@nestjs/core/inspector/noop-graph-inspector'
import { MetadataScanner } from '@nestjs/core/metadata-scanner'
import { DependenciesScanner } from '@nestjs/core/scanner'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { AppModule } from '../app.module'

async function generateOpenApi() {
    const config = new ApplicationConfig()
    config.setGlobalPrefix('api')
    const container = new NestContainer(config)
    const scanner = new DependenciesScanner(container, new MetadataScanner(), NoopGraphInspector, config)
    await scanner.scan(AppModule)
    for (const module of container.getModules().values()) {
        for (const controller of module.controllers.values()) {
            if (!controller.instance && controller.metatype) controller.instance = Object.create(controller.metatype.prototype)
        }
    }

    const document = SwaggerModule.createDocument(
        { container, config, getHttpAdapter: () => undefined } as any,
        new DocumentBuilder()
            .setTitle('VPN Backend API')
            .setDescription('VPN backend API for Telegram bot, subscriptions, payments, and VPN access')
            .setVersion('1.0')
            .addBearerAuth()
            .build(),
    )
    const output = resolve(process.cwd(), process.env.OPENAPI_OUTPUT || '../frontend/openapi.json')
    await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    console.info(`OpenAPI written to ${output}`)
}

generateOpenApi().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
