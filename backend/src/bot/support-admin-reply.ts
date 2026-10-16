import { isUUID } from 'class-validator'

export const SUPPORT_THREAD_UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const SUPPORT_REPLY_MARKER = 'ID обращения:'
const CUSTOMER_SUPPORT_PROMPT = [
    '🆘 Поддержка',
    '',
    'Ответьте на это сообщение текстом или одной фотографией.',
].join('\n')

export function buildCustomerSupportPrompt(): string {
    return CUSTOMER_SUPPORT_PROMPT
}

export function isCustomerSupportReplyPrompt(value: unknown): boolean {
    const text = typeof value === 'string' ? value : ''
    return text.replace(/\r\n/g, '\n').trim() === CUSTOMER_SUPPORT_PROMPT
}

export function buildSupportAdminReplyPrompt(threadId: string): string {
    return [
        '✍️ Ответ пользователю',
        '',
        `${SUPPORT_REPLY_MARKER} ${threadId}`,
        '',
        'Ответьте на это сообщение текстом или одной фотографией с необязательной подписью. Ответ будет отправлен пользователю и сохранён в истории поддержки.',
    ].join('\n')
}

export function extractSupportThreadIdFromReplyPrompt(value: unknown): string | null {
    const text = typeof value === 'string' ? value : ''
    const match = text.match(new RegExp(`(?:^|\\n)${SUPPORT_REPLY_MARKER}\\s*(${SUPPORT_THREAD_UUID_PATTERN})(?:\\n|$)`, 'i'))
    const threadId = match?.[1] || ''
    return isUUID(threadId) ? threadId : null
}
