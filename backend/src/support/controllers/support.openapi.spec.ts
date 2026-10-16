import { AdminSupportController } from './admin-support.controller'
import { SupportController } from './support.controller'

function idempotencyHeaders(method: (...args: any[]) => unknown) {
    const parameters = Reflect.getMetadata('swagger/apiParameters', method) || []
    return parameters.filter((parameter: any) => parameter.in === 'header' && String(parameter.name).toLowerCase() === 'idempotency-key')
}

describe('support photo OpenAPI headers', () => {
    it('documents exactly one required idempotency header for the user photo upload', () => {
        expect(idempotencyHeaders(SupportController.prototype.createPhotoMessage)).toEqual([
            expect.objectContaining({ name: 'Idempotency-Key', required: true }),
        ])
    })

    it('documents exactly one required idempotency header for the admin photo upload', () => {
        expect(idempotencyHeaders(AdminSupportController.prototype.replyPhoto)).toEqual([
            expect.objectContaining({ name: 'Idempotency-Key', required: true }),
        ])
    })
})
