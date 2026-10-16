import { PaymentController } from './payment.controller'
import { RolesEnum } from '../../system/user/enum/roles.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'

describe('PaymentController YooKassa webhook routes', () => {
    it('keeps checkout-options and crypto creation USER-only and delegates only server-owned values', async () => {
        const paymentService = { createCryptoPaymentForUser: jest.fn().mockResolvedValue({ ok: true }) }
        const checkoutOptions = { getForPlan: jest.fn().mockResolvedValue({ planId: 'plan-1' }) }
        const controller = new PaymentController(paymentService as any, {} as any, checkoutOptions as any)

        await expect(controller.checkoutOptionsForPlan({ id: 'user-1' } as any, 'plan-1')).resolves.toEqual({ planId: 'plan-1' })
        await expect(
            controller.createPlategaCryptoPayment({ id: 'user-1' } as any, { planId: 'plan-1', promoCode: 'SAVE10' }),
        ).resolves.toEqual({ ok: true })
        expect(Reflect.getMetadata('role', PaymentController.prototype.checkoutOptionsForPlan)).toBe(RolesEnum.USER)
        expect(Reflect.getMetadata('role', PaymentController.prototype.createPlategaCryptoPayment)).toBe(RolesEnum.USER)
        expect(checkoutOptions.getForPlan).toHaveBeenCalledWith('plan-1', PaymentMerchant.SITE, 'user-1')
        expect(paymentService.createCryptoPaymentForUser).toHaveBeenCalledWith('user-1', 'plan-1', 'SAVE10')
    })

    it.each([
        ['site', PaymentMerchant.SITE],
        ['bot', PaymentMerchant.BOT],
    ])('hardcodes %s merchant and never accepts it from the body', async (route, merchant) => {
        const canonical = { handleWebhook: jest.fn().mockResolvedValue({ ok: true }) }
        const controller = new PaymentController({} as any, canonical as any, {} as any)
        const dto = {
            type: 'notification',
            event: 'payment.succeeded',
            object: { id: 'yk-1', status: 'succeeded' },
            merchant: merchant === PaymentMerchant.SITE ? PaymentMerchant.BOT : PaymentMerchant.SITE,
        } as any
        const result =
            route === 'site'
                ? await controller.yookassaSiteWebhook(dto, {})
                : await controller.yookassaBotWebhook(dto, {})
        expect(result).toEqual({ ok: true })
        expect(canonical.handleWebhook).toHaveBeenCalledWith(merchant, dto, {})
    })
})
