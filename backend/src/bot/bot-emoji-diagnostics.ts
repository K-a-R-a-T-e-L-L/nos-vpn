import { CUSTOM_EMOJI, CustomEmojiKey } from './custom-emoji.registry'

export const WELCOME_CUSTOM_EMOJI_KEYS: CustomEmojiKey[] = [
    'WELCOME_TITLE_ROCKET',
    'WELCOME_CONNECTION',
    'WELCOME_SIMPLE',
    'WELCOME_HELP',
]

export type CustomEmojiRef = {
    key: CustomEmojiKey
    id: string
    fallback: string
}

export type ExtractedCustomEmojiItem = {
    id: string
    emoji: string
}

export type EmojiCheckResult = CustomEmojiRef & {
    valid: boolean
    error?: string
}

export function getCustomEmojiRefs(keys: CustomEmojiKey[] = Object.keys(CUSTOM_EMOJI) as CustomEmojiKey[]): CustomEmojiRef[] {
    return keys.map((key) => ({
        key,
        id: CUSTOM_EMOJI[key].id,
        fallback: CUSTOM_EMOJI[key].fallback,
    }))
}

export function extractCustomEmojiItemsFromMessage(message: any): ExtractedCustomEmojiItem[] {
    const text = String(message?.text || '')
    const entities = Array.isArray(message?.entities) ? message.entities : []
    const items = entities
        .filter((entity: any) => entity?.type === 'custom_emoji' && entity.custom_emoji_id)
        .map((entity: any) => ({
            id: String(entity.custom_emoji_id),
            emoji: text.slice(entity.offset, entity.offset + entity.length) || 'custom emoji',
        }))

    return Array.from(
        new Map<string, ExtractedCustomEmojiItem>(items.map((item) => [`${item.emoji}:${item.id}`, item])).values(),
    )
}

export function buildEmojiCheckReport(results: EmojiCheckResult[]) {
    return [
        'Custom emoji check',
        ...results.map((result) =>
            [
                `${result.valid ? 'VALID' : 'INVALID'} ${result.key}`,
                `id: ${result.id}`,
                `fallback: ${result.fallback}`,
                ...(result.error ? [`error: ${result.error}`] : []),
            ].join('\n'),
        ),
    ].join('\n\n')
}
