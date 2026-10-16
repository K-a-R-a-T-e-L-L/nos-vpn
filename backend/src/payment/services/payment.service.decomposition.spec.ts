import * as fs from 'fs'
import * as path from 'path'

import { PaymentService } from './payment.service'

describe('PaymentService decomposition boundary', () => {
    const servicesDirectory = __dirname

    it('keeps a small compatibility facade backed by focused create and status services', () => {
        const facadePath = path.join(servicesDirectory, 'payment.service.ts')
        const createPath = path.join(servicesDirectory, 'payment-create.service.ts')
        const statusPath = path.join(servicesDirectory, 'payment-status.service.ts')

        expect(fs.existsSync(createPath)).toBe(true)
        expect(fs.existsSync(statusPath)).toBe(true)

        const facade = fs.readFileSync(facadePath, 'utf8')
        const physicalLoc = facade.split(/\r?\n/).length

        expect(physicalLoc).toBeLessThan(500)
        expect(facade).toContain('PaymentCreateService')
        expect(facade).toContain('PaymentStatusService')
        expect(facade).not.toContain('PaymentCanonicalProcessingService')
    })

    it('delegates every public payment operation with exact arguments and results', async () => {
        const paymentCreate = {
            createPayment: jest.fn(async () => ({ operation: 'create' })),
            createBonusPayment: jest.fn(async () => ({ operation: 'bonus' })),
        }
        const paymentStatus = {
            handlePlategaWebhook: jest.fn(async () => ({ operation: 'webhook' })),
            checkLatestPendingPaymentForUser: jest.fn(async () => ({ operation: 'latest' })),
            checkPaymentForUser: jest.fn(async () => ({ operation: 'status' })),
        }
        const facade = new PaymentService({} as any, paymentCreate as any, paymentStatus as any)
        const subscription = { id: 'subscription-1' } as any
        const rawBody = Buffer.from('signed')

        await expect(facade.createPayment(subscription, 'plan-1', 'PROMO', 'web')).resolves.toEqual({
            operation: 'create',
        })
        await expect(facade.createBonusPayment(subscription, 'plan-2', { notifySuccess: false })).resolves.toEqual({
            operation: 'bonus',
        })
        await expect(
            facade.handlePlategaWebhook({ status: 'CONFIRMED' }, { signature: 'value' }, rawBody),
        ).resolves.toEqual({ operation: 'webhook' })
        await expect(facade.checkLatestPendingPaymentForUser('user-1')).resolves.toEqual({ operation: 'latest' })
        await expect(facade.checkPaymentForUser('payment-1', 'user-1')).resolves.toEqual({ operation: 'status' })

        expect(paymentCreate.createPayment).toHaveBeenCalledWith(subscription, 'plan-1', 'PROMO', 'web')
        expect(paymentCreate.createBonusPayment).toHaveBeenCalledWith(subscription, 'plan-2', { notifySuccess: false })
        expect(paymentStatus.handlePlategaWebhook).toHaveBeenCalledWith(
            { status: 'CONFIRMED' },
            { signature: 'value' },
            rawBody,
        )
        expect(paymentStatus.checkLatestPendingPaymentForUser).toHaveBeenCalledWith('user-1')
        expect(paymentStatus.checkPaymentForUser).toHaveBeenCalledWith('payment-1', 'user-1')
    })
})
