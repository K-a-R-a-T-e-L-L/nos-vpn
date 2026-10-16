export type RemnawaveRequestErrorCategory = 'HTTP_ERROR' | 'NETWORK_ERROR' | 'INVALID_RESPONSE'

export class RemnawaveRequestError extends Error {
    constructor(
        readonly category: RemnawaveRequestErrorCategory,
        readonly method: string,
        readonly pathTemplate: string,
        readonly correlationId: string,
        readonly statusCode?: number,
    ) {
        super(`Remnawave request failed: ${category}`)
        this.name = 'RemnawaveRequestError'
    }
}
