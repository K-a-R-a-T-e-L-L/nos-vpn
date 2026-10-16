import { PlategaRecurrentAdminController, PlategaRecurrentUserController } from './platega-recurrent.controller'
import { RolesEnum } from '../../system/user/enum/roles.enum'

describe('Platega recurrent controller authorization boundaries', () => {
    it('keeps user create/read at USER role and exposes no user cancellation method', () => {
        expect(Reflect.getMetadata('role', PlategaRecurrentUserController.prototype.create)).toBe(RolesEnum.USER)
        expect(Reflect.getMetadata('role', PlategaRecurrentUserController.prototype.read)).toBe(RolesEnum.USER)
        expect(PlategaRecurrentUserController.prototype).not.toHaveProperty('cancel')
    })

    it('requires ADMIN role for provider cancel and manual reconciliation', () => {
        expect(Reflect.getMetadata('role', PlategaRecurrentAdminController.prototype.cancel)).toBe(RolesEnum.ADMIN)
        expect(Reflect.getMetadata('role', PlategaRecurrentAdminController.prototype.reconcile)).toBe(RolesEnum.ADMIN)
    })
})
