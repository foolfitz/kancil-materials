import type { GameModule } from '@kancil-quiz/games-sdk';

export interface CardWallOptions {
    startWith: 'front' | 'back';
    autoPlayAudio: boolean;
}

// 遊戲的設定資訊，不含執行程式；老師端與伺服器端的遊戲清單（manifest.json）都由此產生。
export const meta = {
    id: 'card-wall',
    version: '0.1.0',
    title: { 'zh-TW': '圖卡牆' },
    requires: {
        shape: 'card',
        minRounds: 1,
        renders: {
            front: ['text', 'romanization', 'image', 'audio'],
            back: ['text', 'romanization', 'image', 'audio'],
        },
        scored: false,
    },
    optionsSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: '圖卡牆的設定',
        type: 'object',
        additionalProperties: false,
        required: ['startWith', 'autoPlayAudio'],
        properties: {
            startWith: {
                title: '先顯示哪一面',
                description: '點卡片翻面，看另一面。',
                type: 'string',
                oneOf: [
                    { const: 'front', title: '題目那一面' },
                    { const: 'back', title: '答案那一面' },
                ],
                default: 'front',
            },
            autoPlayAudio: {
                title: '翻到有發音的那一面時自動播放',
                type: 'boolean',
                default: true,
            },
        },
    },
    defaultOptions: { startWith: 'front', autoPlayAudio: true },
} satisfies Omit<GameModule<CardWallOptions>, 'mount'>;
