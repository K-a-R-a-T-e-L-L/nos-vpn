import { ConfigService } from '@nestjs/config'
import { DataSourceOptions } from 'typeorm'

export const buildDataSourceOptions = (configService: ConfigService): DataSourceOptions => ({
    type: 'postgres',
    host: configService.get('DATABASE_HOST'),
    port: configService.get('DATABASE_PORT'),
    username: configService.get('DATABASE_USER'),
    password: configService.get('DATABASE_PASSWORD'),
    database: configService.get('DATABASE_DB'),
    entities: [__dirname + '/**/*.entity.{ts,js}'],
    logging: false,
    synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
})
