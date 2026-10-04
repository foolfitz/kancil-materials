import type { GameModule } from '@kancil-quiz/games-sdk';

export interface SpinWheelOptions {
    startWith: 'front' | 'back';
    sliceLabel: 'face' | 'number';
    removeAfterSpin: boolean;
    autoPlayAudio: boolean;
}

// 遊戲的設定資訊，不含執行程式；老師端與伺服器端的遊戲清單（manifest.json）都由此產生。
export const meta = {
    id: 'spin-wheel',
    version: '0.1.0',
    title: { 'zh-TW': '轉盤' },
    requires: {
        shape: 'card',
        // 只有一個詞就不必轉了
        minRounds: 2,
        renders: {
            front: ['text', 'romanization', 'image', 'audio'],
            back: ['text', 'romanization', 'image', 'audio'],
        },
        scored: false,
    },
    optionsSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: '轉盤的設定',
        type: 'object',
        additionalProperties: false,
        required: [
            'startWith',
            'sliceLabel',
            'removeAfterSpin',
            'autoPlayAudio',
        ],
        properties: {
            startWith: {
                title: '轉到時先顯示哪一面',
                description: '點卡片翻面，看另一面。',
                type: 'string',
                oneOf: [
                    { const: 'front', title: '題目那一面' },
                    { const: 'back', title: '答案那一面' },
                ],
                default: 'front',
            },
            sliceLabel: {
                title: '轉盤上顯示',
                type: 'string',
                oneOf: [
                    { const: 'face', title: '先顯示那一面的文字' },
                    { const: 'number', title: '編號（轉到才揭曉）' },
                ],
                default: 'face',
            },
            removeAfterSpin: {
                title: '轉到的詞從轉盤拿掉，每個詞只會轉到一次',
                type: 'boolean',
                default: true,
            },
            autoPlayAudio: {
                title: '有發音的那一面出現時自動播放',
                type: 'boolean',
                default: true,
            },
        },
    },
    defaultOptions: {
        startWith: 'front',
        sliceLabel: 'face',
        removeAfterSpin: true,
        autoPlayAudio: true,
    },
} satisfies Omit<GameModule<SpinWheelOptions>, 'mount'>;
