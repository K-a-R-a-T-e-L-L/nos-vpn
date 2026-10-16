import { Inject, Injectable, LoggerService } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

import { sanitizeLogString, sanitizeLogValue } from './security-log-sanitizer'

export interface TelegramLoggerConfig {
    chatId?: string
    logLevels?: ('log' | 'error' | 'warn' | 'debug' | 'verbose')[]
    appName?: string
    enableConsoleLog?: boolean
    telegramMaxPerMinute?: number
    dedupeWindowMs?: number
    telegramBatchSize?: number
    telegramFlushMs?: number
}

@Injectable()
export class TelegramLoggerService implements LoggerService {
    private config: TelegramLoggerConfig
    private readonly sendTimestamps: number[] = []
    private readonly dedupeSignatures = new Map<string, number>()
    private readonly telegramBuffer: string[] = []
    private flushTimer: NodeJS.Timeout | null = null
    private suppressedByRateLimit = 0

    constructor(
        @InjectBot() private readonly bot: Telegraf,
        @Inject('TELEGRAM_LOGGER_CONFIG') config: TelegramLoggerConfig,
    ) {
        this.config = {
            logLevels: ['error'],
            appName: 'App',
            enableConsoleLog: true,
            telegramMaxPerMinute: 20,
            dedupeWindowMs: 30_000,
            telegramBatchSize: 5,
            telegramFlushMs: 2_000,
            ...config,
        }
    }

    log(message: any, context?: string) {
        this.printMessage(message, 'log', context)
    }

    error(message: any, trace?: string, context?: string) {
        this.printMessage(message, 'error', context, trace)
    }

    warn(message: any, context?: string) {
        this.printMessage(message, 'warn', context)
    }

    debug(message: any, context?: string) {
        this.printMessage(message, 'debug', context)
    }

    verbose(message: any, context?: string) {
        this.printMessage(message, 'verbose', context)
    }

    private printMessage(message: any, logLevel: string, context?: string, trace?: string) {
        const ctx = context || 'Application'
        const sanitizedMessage = sanitizeLogValue(message)
        const sanitizedTrace = trace ? sanitizeLogString(trace) : undefined
        const telegramMessage = this.formatTelegramMessage(sanitizedMessage, logLevel, ctx, sanitizedTrace)
        const consoleMessage = this.formatConsoleMessage(sanitizedMessage, logLevel, ctx, sanitizedTrace)

        if (this.config.enableConsoleLog) {
            const consoleMethod = logLevel === 'error' ? 'error' : logLevel === 'warn' ? 'warn' : 'log'
            console[consoleMethod](consoleMessage)
        }

        if (this.config.logLevels?.includes(logLevel as any)) {
            const signature = `${logLevel}:${ctx}:${this.createSignature(sanitizedMessage)}`
            this.enqueueTelegram(telegramMessage, signature)
        }
    }

    private formatTelegramMessage(message: any, logLevel: string, context: string, trace?: string): string {
        const timestamp = new Date().toISOString()
        let formattedMsg = `<b>[${this.config.appName}]</b> ${timestamp} <b>[${logLevel.toUpperCase()}]</b> <code>[${context}]</code>\n\n`

        if (typeof message === 'object') {
            const jsonString = JSON.stringify(message, null, 2)
            formattedMsg += `<pre><code class="language-json">${this.escapeHtml(jsonString)}</code></pre>`
        } else {
            formattedMsg += this.escapeHtml(String(message))
        }

        if (trace) {
            formattedMsg += `\n\n<b>Stack Trace:</b>\n<pre><code>${this.escapeHtml(trace)}</code></pre>`
        }

        return formattedMsg
    }

    private formatConsoleMessage(message: any, logLevel: string, context: string, trace?: string): string {
        const timestamp = new Date().toISOString()
        const header = `[${this.config.appName}] ${timestamp} [${logLevel.toUpperCase()}] [${context}]`
        const body = typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message)
        const coloredHeader = this.colorize(header, logLevel)
        const coloredBody = this.colorize(body, logLevel)

        if (trace) {
            return `${coloredHeader}\n${coloredBody}\n\n${this.colorize('Stack Trace:', 'error')}\n${trace}`
        }

        return `${coloredHeader}\n${coloredBody}`
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    private createSignature(message: any): string {
        const raw = typeof message === 'object' ? JSON.stringify(message) : String(message)
        return raw.slice(0, 512)
    }

    private enqueueTelegram(message: string, signature: string) {
        const now = Date.now()
        const dedupeWindow = this.config.dedupeWindowMs ?? 30_000
        const signatureTs = this.dedupeSignatures.get(signature)
        if (signatureTs && now - signatureTs < dedupeWindow) {
            return
        }
        this.dedupeSignatures.set(signature, now)
        this.cleanupDedupe(now, dedupeWindow)

        this.telegramBuffer.push(message)
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null
                void this.flushTelegramBuffer()
            }, this.config.telegramFlushMs ?? 2_000)
        }
    }

    private cleanupDedupe(now: number, dedupeWindow: number) {
        for (const [key, ts] of this.dedupeSignatures.entries()) {
            if (now - ts > dedupeWindow) {
                this.dedupeSignatures.delete(key)
            }
        }
    }

    private canSendNow() {
        const now = Date.now()
        const minuteAgo = now - 60_000
        while (this.sendTimestamps.length && this.sendTimestamps[0] < minuteAgo) {
            this.sendTimestamps.shift()
        }
        return this.sendTimestamps.length < (this.config.telegramMaxPerMinute ?? 20)
    }

    private registerSent() {
        this.sendTimestamps.push(Date.now())
    }

    private async flushTelegramBuffer() {
        if (!this.telegramBuffer.length) return

        if (!this.canSendNow()) {
            this.suppressedByRateLimit += this.telegramBuffer.length
            this.telegramBuffer.length = 0
            return
        }

        const batchSize = this.config.telegramBatchSize ?? 5
        const batch = this.telegramBuffer.splice(0, batchSize)

        if (this.suppressedByRateLimit > 0) {
            const suppressedMessage = `<b>[${this.config.appName}]</b> suppressed by rate limit: ${this.suppressedByRateLimit}`
            this.suppressedByRateLimit = 0
            await this.sendToTelegram(suppressedMessage)
        }

        const payload =
            batch.length === 1
                ? batch[0]
                : `<b>[${this.config.appName}]</b> batched ${batch.length} logs\n\n${batch.join('\n\n-----\n\n')}`

        await this.sendToTelegram(payload)

        if (this.telegramBuffer.length) {
            if (!this.flushTimer) {
                this.flushTimer = setTimeout(() => {
                    this.flushTimer = null
                    void this.flushTelegramBuffer()
                }, this.config.telegramFlushMs ?? 2_000)
            }
        }
    }

    private async sendToTelegram(message: string) {
        if (!this.config.chatId) return
        try {
            const chunks = this.splitMessage(message, 4000)
            for (const chunk of chunks) {
                await this.bot.telegram.sendMessage(this.config.chatId, chunk, { parse_mode: 'HTML' })
                this.registerSent()
            }
        } catch (error: any) {
            console.error('Failed to send log to Telegram:', sanitizeLogString(String(error?.message || error)))
        }
    }

    private splitMessage(message: string, maxLength: number): string[] {
        const chunks: string[] = []
        let remaining = message

        while (remaining.length > maxLength) {
            let chunk = remaining.substring(0, maxLength)
            const lastNewline = chunk.lastIndexOf('\n')

            if (lastNewline > maxLength * 0.5) {
                chunk = remaining.substring(0, lastNewline)
                remaining = remaining.substring(lastNewline + 1)
            } else {
                remaining = remaining.substring(maxLength)
            }

            chunks.push(chunk)
        }

        if (remaining) {
            chunks.push(remaining)
        }

        return chunks
    }

    private colorize(text: string, logLevel: string) {
        if (!process.stdout.isTTY || process.env.NO_COLOR) {
            return text
        }

        const colors: Record<string, string> = {
            log: '\x1b[32m', // green
            warn: '\x1b[33m', // yellow
            error: '\x1b[31m', // red
            debug: '\x1b[36m', // cyan
            verbose: '\x1b[90m', // gray
        }
        const reset = '\x1b[0m'
        const color = colors[logLevel] ?? '\x1b[37m'
        return `${color}${text}${reset}`
    }
}
