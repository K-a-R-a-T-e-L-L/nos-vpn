import { DynamicModule, Global, Module } from '@nestjs/common';
import { ModuleMetadata } from '@nestjs/common/interfaces';

import { TelegramLoggerConfig, TelegramLoggerService } from './logger.service';

export interface TelegramLoggerAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    inject?: any[];
    useFactory: (...args: any[]) => TelegramLoggerConfig | Promise<TelegramLoggerConfig>;
}

@Global()
@Module({})
export class TelegramLoggerModule {
    static forRoot(config: TelegramLoggerConfig): DynamicModule {
        const configProvider = {
            provide: 'TELEGRAM_LOGGER_CONFIG',
            useValue: config,
        }

        const loggerProvider = {
            provide: TelegramLoggerService,
            useClass: TelegramLoggerService,
        }

        return {
            module: TelegramLoggerModule,
            providers: [configProvider, loggerProvider],
            exports: [TelegramLoggerService],
        }
    }

    static forRootAsync(options: TelegramLoggerAsyncOptions): DynamicModule {
        const configProvider = {
            provide: 'TELEGRAM_LOGGER_CONFIG',
            useFactory: options.useFactory,
            inject: options.inject ?? [],
        };

        const loggerProvider = {
            provide: TelegramLoggerService,
            useClass: TelegramLoggerService,
        };

        return {
            module: TelegramLoggerModule,
            imports: options.imports ?? [],
            providers: [configProvider, loggerProvider],
            exports: [TelegramLoggerService],
        };
    }
}
