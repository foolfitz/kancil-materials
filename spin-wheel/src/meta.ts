import type { GameModule } from '@kancil-quiz/games-sdk';

export interface SpinWheelOptions {
    sliceLabel: 'target' | 'number';
    removeAfterSpin: boolean;
}

// 遊戲的設定資訊，不含執行程式；老師端與伺服器端的遊戲清單（manifest.json）都由此產生。
export const meta = {
    id: 'spin-wheel',
    version: '0.2.0',
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
        required: ['sliceLabel', 'removeAfterSpin'],
        properties: {
            sliceLabel: {
                title: '轉盤上顯示',
                type: 'string',
                oneOf: [
                    { const: 'target', title: '詞（目標語，例如印尼語）' },
                    { const: 'number', title: '編號（轉到才揭曉）' },
                ],
                default: 'target',
            },
            removeAfterSpin: {
                title: '轉到的詞從轉盤拿掉，每個詞只會轉到一次',
                type: 'boolean',
                default: true,
            },
        },
    },
    defaultOptions: {
        sliceLabel: 'target',
        removeAfterSpin: true,
    },
} satisfies Omit<GameModule<SpinWheelOptions>, 'mount'>;

// 活動存的設定再檢查一次。0.1 版的活動另有 startWith、autoPlayAudio（已不用，略過），
// sliceLabel 可能是 'face'（先顯示那一面的文字，已拿掉），改用預設。
export function normalizeOptions(
    raw: Partial<Record<keyof SpinWheelOptions, unknown>> | undefined,
): SpinWheelOptions {
    return {
        sliceLabel: raw?.sliceLabel === 'number' ? 'number' : 'target',
        removeAfterSpin:
            typeof raw?.removeAfterSpin === 'boolean'
                ? raw.removeAfterSpin
                : meta.defaultOptions.removeAfterSpin,
    };
}
