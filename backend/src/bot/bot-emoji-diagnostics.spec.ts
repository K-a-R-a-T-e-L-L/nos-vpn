import {
    WELCOME_CUSTOM_EMOJI_KEYS,
    buildEmojiCheckReport,
    extractCustomEmojiItemsFromMessage,
    getCustomEmojiRefs,
} from './bot-emoji-diagnostics'

describe('bot emoji diagnostics', () => {
    it('returns welcome custom emoji refs from registry only', () => {
        const refs = getCustomEmojiRefs(WELCOME_CUSTOM_EMOJI_KEYS)

        expect(refs).toEqual([
            { key: 'WELCOME_TITLE_ROCKET', id: '5222381031629283378', fallback: '🚀' },
            { key: 'WELCOME_CONNECTION', id: '5818928255054385205', fallback: '🟢' },
            { key: 'WELCOME_SIMPLE', id: '5208942800514596941', fallback: '💗' },
            { key: 'WELCOME_HELP', id: '5224428893510850014', fallback: '💎' },
        ])
    })

    it('extracts MessageEntity.custom_emoji_id from /code message entities', () => {
        const message = {
            text: '/code 🩷 text ⚡',
            entities: [
                { type: 'bot_command', offset: 0, length: 5 },
                { type: 'custom_emoji', offset: 6, length: 2, custom_emoji_id: '5208942800514596941' },
                { type: 'custom_emoji', offset: 14, length: 1, custom_emoji_id: '5368324170671202286' },
            ],
        }

        expect(extractCustomEmojiItemsFromMessage(message)).toEqual([
            { emoji: '🩷', id: '5208942800514596941' },
            { emoji: '⚡', id: '5368324170671202286' },
        ])
    })

    it('deduplicates repeated custom emoji by emoji and id', () => {
        const message = {
            text: '/code 🩷 🩷',
            entities: [
                { type: 'bot_command', offset: 0, length: 5 },
                { type: 'custom_emoji', offset: 6, length: 2, custom_emoji_id: '5208942800514596941' },
                { type: 'custom_emoji', offset: 9, length: 2, custom_emoji_id: '5208942800514596941' },
            ],
        }

        expect(extractCustomEmojiItemsFromMessage(message)).toEqual([
            { emoji: '🩷', id: '5208942800514596941' },
        ])
    })

    it('builds human-readable emoji check report', () => {
        const report = buildEmojiCheckReport([
            { key: 'WELCOME_TITLE_ROCKET', id: '5222381031629283378', fallback: '🚀', valid: true },
            {
                key: 'WELCOME_SIMPLE',
                id: '5223712305139117771',
                fallback: '💗',
                valid: false,
                error: 'not found by Telegram API',
            },
        ])

        expect(report).toContain('VALID WELCOME_TITLE_ROCKET')
        expect(report).toContain('INVALID WELCOME_SIMPLE')
        expect(report).toContain('not found by Telegram API')
    })
})
