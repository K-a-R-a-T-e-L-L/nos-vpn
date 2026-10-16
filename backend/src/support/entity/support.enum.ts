export enum SupportThreadStatusEnum {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
}

export enum SupportAuthorTypeEnum {
    USER = 'USER',
    ADMIN = 'ADMIN',
}

export enum SupportMessageSourceEnum {
    TELEGRAM = 'TELEGRAM',
    WEBSITE = 'WEBSITE',
    ADMIN_BOT = 'ADMIN_BOT',
    ADMIN_PANEL = 'ADMIN_PANEL',
}

export enum SupportMessageContentKindEnum {
    TEXT = 'TEXT',
    PHOTO = 'PHOTO',
}

export enum SupportTelegramDeliveryStatusEnum {
    PENDING = 'PENDING',
    SENDING = 'SENDING',
    SENT = 'SENT',
    FAILED = 'FAILED',
}
