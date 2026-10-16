import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { DataSource } from 'typeorm'

import { SupportMediaStorageService } from './support-media-storage.service'
import { SupportDeliveryStatus, SupportService } from './support.service'
import { startDisposablePostgres } from '../../analytics/testing/disposable-postgres.helper'
import { PaymentMethod } from '../../payment/entity/payment-method.entity'
import { Plan } from '../../plan/entity/plan.entity'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { User } from '../../system/user/entity/user.entity'
import { SupportMessage } from '../entity/support-message.entity'
import { SupportThread } from '../entity/support-thread.entity'
import {
    SupportAuthorTypeEnum,
    SupportMessageContentKindEnum,
    SupportMessageSourceEnum,
    SupportTelegramDeliveryStatusEnum,
} from '../entity/support.enum'

jest.setTimeout(90_000)

function createDataSource(cluster: { host: string; port: number; user: string; database: string }) {
    return new DataSource({
        type: 'postgres',
        host: cluster.host,
        port: cluster.port,
        username: cluster.user,
        database: cluster.database,
        entities: [User, Plan, Subscription, PaymentMethod, SupportThread, SupportMessage],
        synchronize: true,
        migrationsRun: false,
        dropSchema: false,
    })
}

describe('SupportMessage PostgreSQL persistence and schema synchronization', () => {
    it('keeps a legacy text row while synchronizing the nullable media shape and dedupes concurrent Telegram delivery', async () => {
        const cluster = await startDisposablePostgres('nosvpn-support-pg-')
        let dataSource: DataSource | undefined
        let stopError: unknown
        try {
            console.info(`[support-postgres] pid=${cluster.pid} port=${cluster.port}`)
            dataSource = createDataSource(cluster)
            await dataSource.initialize()
            const user = await dataSource.getRepository(User).save({ email: 'support-postgres@example.test', telegramId: 42 } as any)
            const thread = await dataSource.getRepository(SupportThread).save({ userId: user.id } as any)
            const legacy = await dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.TELEGRAM,
                contentKind: SupportMessageContentKindEnum.TEXT,
                text: 'legacy text',
            } as any)
            await dataSource.destroy()

            const raw = createDataSource(cluster)
            await raw.initialize()
            await raw.query('DROP INDEX IF EXISTS "UQ_support_message_telegram_source"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "attachment"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "source_telegram_chat_id"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "source_telegram_message_id"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "telegram_delivery_status"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "telegram_delivered_at"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "telegram_delivery_attempted_at"')
            await raw.query('ALTER TABLE "support_message" DROP COLUMN "content_kind"')
            await raw.query('ALTER TABLE "support_message" ALTER COLUMN "text" SET NOT NULL')
            await raw.destroy()

            dataSource = createDataSource(cluster)
            await dataSource.initialize()
            const restored = await dataSource.getRepository(SupportMessage).findOneByOrFail({ id: legacy.id })
            expect(restored.text).toBe('legacy text')
            expect(restored.contentKind).toBe(SupportMessageContentKindEnum.TEXT)
            const columns = await dataSource.query(
                "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'support_message'",
            )
            expect(columns).toEqual(expect.arrayContaining([
                expect.objectContaining({ column_name: 'content_kind', is_nullable: 'NO' }),
                expect.objectContaining({ column_name: 'attachment', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'source_telegram_chat_id', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'source_telegram_message_id', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'source_request_id', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'text', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'telegram_delivery_status', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'telegram_delivery_attempted_at', is_nullable: 'YES' }),
                expect.objectContaining({ column_name: 'telegram_delivered_at', is_nullable: 'YES' }),
            ]))
            expect(restored.telegramDeliveryStatus).toBeNull()
            expect(restored.telegramDeliveryAttemptedAt).toBeNull()
            expect(restored.telegramDeliveredAt).toBeNull()
            const storedPhoto = await dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.WEBSITE,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: 'private storage photo',
                attachment: {
                    storageProvider: 'FILESYSTEM',
                    storageKey: '11111111-1111-4111-8111-111111111111.png',
                    mimeType: 'image/png',
                    byteSize: 67,
                    sha256: 'a'.repeat(64),
                },
            } as any)
            expect(storedPhoto.attachment).toEqual(expect.objectContaining({
                storageProvider: 'FILESYSTEM',
                storageKey: '11111111-1111-4111-8111-111111111111.png',
            }))
            expect(storedPhoto.attachment?.telegramFileId).toBeUndefined()
            const index = await dataSource.query(
                "SELECT indexdef FROM pg_indexes WHERE tablename = 'support_message' AND indexname = 'UQ_support_message_telegram_source'",
            )
            expect(index[0]?.indexdef).toContain('WHERE')
            const requestIndex = await dataSource.query(
                "SELECT indexdef FROM pg_indexes WHERE tablename = 'support_message' AND indexname = 'UQ_support_message_web_request'",
            )
            expect(requestIndex[0]?.indexdef).toContain('source_request_id')
            const requestId = '33333333-3333-4333-8333-333333333333'
            const requestPhoto = await dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.WEBSITE,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: 'idempotent photo',
                sourceRequestId: requestId,
                attachment: { storageProvider: 'FILESYSTEM', storageKey: '33333333-3333-4333-8333-333333333333.webp', mimeType: 'image/webp', byteSize: 1 },
            } as any)
            await expect(dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.WEBSITE,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: 'duplicate',
                sourceRequestId: requestId,
            } as any)).rejects.toThrow()
            await expect(dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.USER,
                source: SupportMessageSourceEnum.WEBSITE,
                contentKind: SupportMessageContentKindEnum.PHOTO,
                text: 'different request',
                sourceRequestId: '44444444-4444-4444-8444-444444444444',
            } as any)).resolves.toBeDefined()
            expect(requestPhoto.sourceRequestId).toBe(requestId)

            const notificationService = { notify: jest.fn().mockResolvedValue({ message_id: 201 }), notifyWithTelegramPhotoId: jest.fn() }
            const service = new SupportService(
                dataSource.getRepository(SupportThread),
                dataSource.getRepository(SupportMessage),
                dataSource.getRepository(User),
                notificationService as any,
                { get: jest.fn().mockReturnValue('-100999') } as any,
                { warn: jest.fn(), error: jest.fn() } as any,
                dataSource,
            )
            const mediaRoot = await mkdtemp(join(tmpdir(), 'nosvpn-support-photo-race-'))
            try {
                let releaseWrites!: () => void
                const writesReleased = new Promise<void>((resolve) => { releaseWrites = resolve })
                let writeCount = 0
                const storage = new SupportMediaStorageService(
                    { get: jest.fn().mockReturnValue(mediaRoot) } as any,
                    { warn: jest.fn() } as any,
                )
                const raceStorage = {
                    write: async (image: any) => {
                        writeCount += 1
                        if (writeCount === 2) releaseWrites()
                        await writesReleased
                        return storage.write(image)
                    },
                    read: storage.read.bind(storage),
                    cleanup: storage.cleanup.bind(storage),
                }
                const photoNotifications = {
                    notify: jest.fn().mockResolvedValue({ message_id: 301 }),
                    notifyWithTelegramPhotoId: jest.fn(),
                    notifyWithSupportMedia: jest.fn().mockResolvedValue(undefined),
                }
                const photoService = new SupportService(
                    dataSource.getRepository(SupportThread),
                    dataSource.getRepository(SupportMessage),
                    dataSource.getRepository(User),
                    photoNotifications as any,
                    { get: jest.fn().mockReturnValue('-100999') } as any,
                    { warn: jest.fn(), error: jest.fn() } as any,
                    dataSource,
                    raceStorage as any,
                )
                const photoInput = {
                    userId: user.id,
                    text: 'concurrent photo',
                    upload: { buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex'), size: 67 } as Express.Multer.File,
                    sourceRequestId: '55555555-5555-4555-8555-555555555555',
                }
                const [photoA, photoB] = await Promise.all([
                    photoService.createUserPhotoMessage(photoInput),
                    photoService.createUserPhotoMessage(photoInput),
                ])
                expect(writeCount).toBe(2)
                expect([photoA.notification, photoB.notification].sort()).toEqual([SupportDeliveryStatus.SENT, SupportDeliveryStatus.SKIPPED_DUPLICATE].sort())
                expect(await dataSource.getRepository(SupportMessage).count({ where: { source: SupportMessageSourceEnum.WEBSITE, sourceRequestId: photoInput.sourceRequestId } as any })).toBe(1)
                expect(await readdir(mediaRoot)).toHaveLength(1)
                expect(photoNotifications.notify).toHaveBeenCalledTimes(1)
                expect(photoNotifications.notifyWithSupportMedia).toHaveBeenCalledTimes(1)
            } finally {
                await rm(mediaRoot, { recursive: true, force: true })
            }
            const input = { userId: user.id, text: 'repeat-safe', source: 'TELEGRAM' as const, sourceTelegramChatId: '42', sourceTelegramMessageId: '500' }
            const [first, second] = await Promise.all([service.createUserMessage(input), service.createUserMessage(input)])
            expect([first.notification, second.notification].sort()).toEqual([SupportDeliveryStatus.SENT, SupportDeliveryStatus.SKIPPED_DUPLICATE].sort())
            expect(await dataSource.getRepository(SupportMessage).count({ where: { sourceTelegramChatId: '42', sourceTelegramMessageId: '500' } })).toBe(1)
            expect(notificationService.notify).toHaveBeenCalledTimes(2)

            const adminMessage = await dataSource.getRepository(SupportMessage).save({
                threadId: thread.id,
                userId: user.id,
                authorType: SupportAuthorTypeEnum.ADMIN,
                source: SupportMessageSourceEnum.ADMIN_BOT,
                contentKind: SupportMessageContentKindEnum.TEXT,
                text: 'Ответ для concurrent retry',
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.FAILED,
            } as any)
            const claimA = await (service as any).claimAdminDelivery(adminMessage.id)
            expect(claimA.claimed).toBe(true)
            expect(claimA.claimedAt).toBeInstanceOf(Date)
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: new Date(Date.now() - 6 * 60 * 1000),
            })
            const claimB = await (service as any).claimAdminDelivery(adminMessage.id)
            expect(claimB.claimed).toBe(true)
            expect(claimB.claimedAt).toBeInstanceOf(Date)
            const sentByB = await (service as any).finalizeAdminDelivery(
                adminMessage.id,
                claimB.claimedAt,
                SupportDeliveryStatus.SENT,
            )
            expect(sentByB.delivery).toBe(SupportDeliveryStatus.SENT)
            const bState = await dataSource.getRepository(SupportMessage).findOneByOrFail({ id: adminMessage.id })
            expect(bState.telegramDeliveryStatus).toBe(SupportTelegramDeliveryStatusEnum.SENT)
            expect(bState.telegramDeliveredAt).toBeInstanceOf(Date)
            const staleFailed = await (service as any).finalizeAdminDelivery(
                adminMessage.id,
                claimA.claimedAt,
                SupportDeliveryStatus.FAILED,
            )
            expect(staleFailed.delivery).toBe(SupportDeliveryStatus.SENT)
            expect(staleFailed.alreadySent).toBe(true)
            const afterStaleFailure = await dataSource.getRepository(SupportMessage).findOneByOrFail({ id: adminMessage.id })
            expect(afterStaleFailure.telegramDeliveryStatus).toBe(SupportTelegramDeliveryStatusEnum.SENT)
            expect(afterStaleFailure.telegramDeliveredAt?.getTime()).toBe(bState.telegramDeliveredAt?.getTime())

            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: new Date(Date.now() - 6 * 60 * 1000),
                telegramDeliveredAt: null,
            })
            const claimC = await (service as any).claimAdminDelivery(adminMessage.id)
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: new Date(Date.now() - 6 * 60 * 1000),
            })
            const claimD = await (service as any).claimAdminDelivery(adminMessage.id)
            const staleSent = await (service as any).finalizeAdminDelivery(
                adminMessage.id,
                claimC.claimedAt,
                SupportDeliveryStatus.SENT,
            )
            expect(staleSent.inProgress).toBe(true)
            expect(staleSent.delivery).toBe(SupportDeliveryStatus.FAILED)
            expect((await dataSource.getRepository(SupportMessage).findOneByOrFail({ id: adminMessage.id })).telegramDeliveryStatus).toBe(SupportTelegramDeliveryStatusEnum.SENDING)
            const failedByD = await (service as any).finalizeAdminDelivery(
                adminMessage.id,
                claimD.claimedAt,
                SupportDeliveryStatus.FAILED,
            )
            expect(failedByD.delivery).toBe(SupportDeliveryStatus.FAILED)

            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.PENDING,
                telegramDeliveryAttemptedAt: null,
                telegramDeliveredAt: null,
            })
            const normalSentClaim = await (service as any).claimAdminDelivery(adminMessage.id)
            expect((await (service as any).finalizeAdminDelivery(adminMessage.id, normalSentClaim.claimedAt, SupportDeliveryStatus.SENT)).delivery).toBe(SupportDeliveryStatus.SENT)
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.PENDING,
                telegramDeliveryAttemptedAt: null,
                telegramDeliveredAt: null,
            })
            const normalFailedClaim = await (service as any).claimAdminDelivery(adminMessage.id)
            expect((await (service as any).finalizeAdminDelivery(adminMessage.id, normalFailedClaim.claimedAt, SupportDeliveryStatus.FAILED)).delivery).toBe(SupportDeliveryStatus.FAILED)
            notificationService.notify.mockClear()
            notificationService.notify.mockImplementation(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50))
                return undefined
            })
            const [retryOne, retryTwo] = await Promise.all([
                service.retryAdminDelivery(adminMessage.id),
                service.retryAdminDelivery(adminMessage.id),
            ])
            expect([retryOne.delivery, retryTwo.delivery]).toContain(SupportDeliveryStatus.SENT)
            expect([retryOne, retryTwo].every((result) => result.delivery === SupportDeliveryStatus.SENT || result.inProgress)).toBe(true)
            expect(notificationService.notify).toHaveBeenCalledTimes(1)
            expect((await dataSource.getRepository(SupportMessage).count({ where: { id: adminMessage.id } }))).toBe(1)
            expect((await dataSource.getRepository(SupportMessage).findOneByOrFail({ id: adminMessage.id })).telegramDeliveryStatus).toBe(SupportTelegramDeliveryStatusEnum.SENT)

            notificationService.notify.mockClear()
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, { telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENT })
            const [alreadyOne, alreadyTwo] = await Promise.all([
                service.retryAdminDelivery(adminMessage.id),
                service.retryAdminDelivery(adminMessage.id),
            ])
            expect(alreadyOne.alreadySent).toBe(true)
            expect(alreadyTwo.alreadySent).toBe(true)
            expect(notificationService.notify).not.toHaveBeenCalled()

            notificationService.notify.mockClear()
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: new Date(Date.now() - 6 * 60 * 1000),
            })
            const stale = await service.retryAdminDelivery(adminMessage.id)
            expect(stale.delivery).toBe(SupportDeliveryStatus.SENT)
            expect(notificationService.notify).toHaveBeenCalledTimes(1)

            notificationService.notify.mockClear()
            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: SupportTelegramDeliveryStatusEnum.SENDING,
                telegramDeliveryAttemptedAt: new Date(),
            })
            const fresh = await service.retryAdminDelivery(adminMessage.id)
            expect(fresh.inProgress).toBe(true)
            expect(notificationService.notify).not.toHaveBeenCalled()

            await dataSource.getRepository(SupportMessage).update(adminMessage.id, {
                telegramDeliveryStatus: null,
                telegramDeliveryAttemptedAt: null,
            })
            const legacyRetry = await service.retryAdminDelivery(adminMessage.id)
            expect(legacyRetry.delivery).toBe(SupportDeliveryStatus.SENT)
            const notificationCallsBeforeRollback = notificationService.notify.mock.calls.length

            await dataSource.query(`CREATE OR REPLACE FUNCTION fail_support_thread_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced thread update failure'; END; $$ LANGUAGE plpgsql`)
            await dataSource.query('CREATE TRIGGER fail_support_thread_update BEFORE UPDATE ON "support_thread" FOR EACH ROW EXECUTE FUNCTION fail_support_thread_update()')
            await expect(
                service.createUserMessage({ userId: user.id, text: 'must rollback', source: 'TELEGRAM', sourceTelegramChatId: '42', sourceTelegramMessageId: '501' }),
            ).rejects.toThrow()
            expect(await dataSource.getRepository(SupportMessage).count({ where: { sourceTelegramChatId: '42', sourceTelegramMessageId: '501' } })).toBe(0)
            expect(notificationService.notify).toHaveBeenCalledTimes(notificationCallsBeforeRollback)
        } finally {
            if (dataSource?.isInitialized) await dataSource.destroy().catch(() => undefined)
            try { cluster.stop() } catch (error) { stopError = error }
            if (stopError) throw stopError
        }
    })
})
