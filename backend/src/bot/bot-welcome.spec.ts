import { buildPlainWelcomeMessage, buildWelcomeMessage } from './bot-welcome'
import { CUSTOM_EMOJI, tgEmoji } from './custom-emoji.registry'

describe('bot welcome message emoji style', () => {
    it('contains welcome custom emoji keys with valid fallbacks', () => {
        expect(CUSTOM_EMOJI.WELCOME_TITLE_ROCKET).toEqual(
            expect.objectContaining({ id: '5222381031629283378', fallback: '🚀' }),
        )
        expect(CUSTOM_EMOJI.WELCOME_CONNECTION).toEqual(
            expect.objectContaining({ id: '5818928255054385205', fallback: '🟢' }),
        )
        expect(CUSTOM_EMOJI.WELCOME_SIMPLE).toEqual(
            expect.objectContaining({ id: '5208942800514596941', fallback: '💗' }),
        )
        expect(CUSTOM_EMOJI.WELCOME_HELP).toEqual(
            expect.objectContaining({ id: '5224428893510850014', fallback: '💎' }),
        )
    })

    it('renders welcome custom emoji through tgEmoji helper', () => {
        expect(tgEmoji('WELCOME_TITLE_ROCKET')).toBe('<tg-emoji emoji-id="5222381031629283378">🚀</tg-emoji>')
        expect(tgEmoji('WELCOME_SIMPLE')).toBe('<tg-emoji emoji-id="5208942800514596941">💗</tg-emoji>')
    })

    it('builds HTML welcome message without debug text', () => {
        const message = buildWelcomeMessage()

        expect(message).toContain('<tg-emoji emoji-id="5222381031629283378">🚀</tg-emoji>')
        expect(message).toContain('<tg-emoji emoji-id="5208942800514596941">💗</tg-emoji>')
        expect(message).toContain('<b>Добро пожаловать в NOS VPN.</b>')
        expect(message).toContain('Подключение здесь занимает всего пару минут')
        expect(message).toContain('Дальше всё просто')
        expect(message).toContain('Если что-то пойдёт не так')
        expect(message).not.toContain('/code')
    })

    it('builds plain fallback welcome message without custom emoji html', () => {
        const message = buildPlainWelcomeMessage()

        expect(message).toContain('🚀 Добро пожаловать в NOS VPN.')
        expect(message).toContain('🟢 Подключение здесь занимает всего пару минут')
        expect(message).not.toContain('<tg-emoji')
        expect(message).not.toContain('/code')
    })
})
