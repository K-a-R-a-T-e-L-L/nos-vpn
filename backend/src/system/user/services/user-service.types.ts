import { User } from '../entity/user.entity'

export type TelegramProfileInput = {
    id: number
    username?: string
    first_name?: string
    last_name?: string
    is_premium?: boolean
    language_code?: string
}
export type TemporaryWebCredentials = { login: string; password: string }
export type TelegramUserProvisionResult = {
    user: User
    isNewUser: boolean
    temporaryCredentials?: TemporaryWebCredentials
}
