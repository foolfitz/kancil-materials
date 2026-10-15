import type { Face, Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import { meta, normalizeOptions } from '../src/meta';
import {
    TURNS,
    WheelSession,
    cardRounds,
    sliceAt,
    targetRotation,
    wordOf,
} from '../src/session';
import type { CardRound } from '../src/session';

function cards(n: number): Round[] {
    return Array.from({ length: n }, (_, i) => ({
        shape: 'card',
        entryId: `e${i + 1}`,
        front: { text: `正面 ${i + 1}` },
        back: { text: `背面 ${i + 1}` },
    }));
}

// 依序回傳指定的值，用完從頭再來
function sequence(...values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
}

describe('targetRotation', () => {
    it('停下時指針指著要的那一片，而且至少轉了幾圈', () => {
        for (const n of [2, 3, 5, 8, 13]) {
            for (let index = 0; index < n; index++) {
                for (const jitter of [-0.35, 0, 0.35]) {
                    for (const current of [0, 123, 4567.5]) {
                        const rotation = targetRotation(
                            current,
                            index,
                            n,
                            jitter,
                        );
                        expect(sliceAt(rotation, n)).toBe(index);
                        expect(rotation - current).toBeGreaterThanOrEqual(
                            TURNS * 360,
                        );
                        expect(rotation - current).toBeLessThan(
                            (TURNS + 1) * 360,
                        );
                    }
                }
            }
        }
    });
});

describe('WheelSession', () => {
    it('轉到的詞拿掉，每個詞只會轉到一次，轉完就結束', () => {
        // 0.99 → 最後一片；0.5 → 偏移 0
        const session = new WheelSession(
            cardRounds(cards(3)),
            sequence(0.99, 0.5),
            true,
        );
        const first = session.spin();
        expect(first?.card.entryId).toBe('e3');
        expect(first?.firstTime).toBe(true);
        expect(sliceAt(session.rotation, 3)).toBe(2);
        expect(session.slices).toHaveLength(3); // 關掉之前還在轉盤上

        expect(session.spin()?.card.entryId).toBe('e2');
        expect(session.slices.map((card) => card.entryId)).toEqual([
            'e1',
            'e2',
        ]);
        expect(session.spin()?.card.entryId).toBe('e1');
        session.dismiss();
        expect(session.done).toBe(true);
        expect(session.spin()).toBeNull();
        expect(session.viewedCount).toBe(3);

        session.restart();
        expect(session.slices).toHaveLength(3);
        expect(session.spin()?.firstTime).toBe(false);
    });

    it('設定為不拿掉時，同一個詞可以再轉到，看過只算一次', () => {
        const session = new WheelSession(
            cardRounds(cards(4)),
            sequence(0.1, 0.5),
            false,
        );
        expect(session.spin()?.card.entryId).toBe('e1');
        const again = session.spin();
        expect(again?.card.entryId).toBe('e1');
        expect(again?.firstTime).toBe(false);
        expect(session.slices).toHaveLength(4);
        expect(session.viewedCount).toBe(1);
    });
});

function card(front: Face, back: Face): CardRound {
    return { shape: 'card', entryId: 'e1', front, back };
}

describe('wordOf', () => {
    it('用目標語的那一面，連同那一面的發音（教材題組：題目是插圖與中文，答案是印尼語）', () => {
        expect(
            wordOf(
                card(
                    { image: '/ayah.webp', text: '爸爸', lang: 'zh-TW' },
                    { text: 'ayah', lang: 'id', audio: '/ayah.mp3' },
                ),
                'id',
            ),
        ).toEqual({
            text: 'ayah',
            romanization: undefined,
            audio: '/ayah.mp3',
        });
    });

    it('目標語在題目那一面也一樣，羅馬拼音一起顯示', () => {
        expect(
            wordOf(
                card(
                    { text: 'สวัสดี', lang: 'th', romanization: 'sawatdi' },
                    { text: '你好', lang: 'zh-TW', audio: '/zh.mp3' },
                ),
                'th',
            ),
        ).toEqual({ text: 'สวัสดี', romanization: 'sawatdi', audio: undefined });
    });

    it('沒有音檔就沒有發音（只顯示有音檔的 🔊）', () => {
        expect(
            wordOf(
                card(
                    { text: '爸爸', lang: 'zh-TW' },
                    { text: 'ayah', lang: 'id' },
                ),
                'id',
            ).audio,
        ).toBeUndefined();
    });

    it('詞那一面沒有音檔時，用另一面只有音檔的（題目只有發音）', () => {
        expect(
            wordOf(
                card({ audio: '/ayah.mp3' }, { text: 'ayah', lang: 'id' }),
                'id',
            ),
        ).toEqual({
            text: 'ayah',
            romanization: undefined,
            audio: '/ayah.mp3',
        });
    });

    it('哪一面都沒有目標語時（問答組不標語言），用有文字的那一面，題目那一面優先', () => {
        expect(
            wordOf(card({ text: 'Apa ini?' }, { text: 'buku' }), 'id').text,
        ).toBe('Apa ini?');
        expect(
            wordOf(card({ image: '/a.webp' }, { text: 'buku' }), 'id').text,
        ).toBe('buku');
        expect(
            wordOf(card({ image: '/a.webp' }, { romanization: 'buku' }), 'id'),
        ).toEqual({ text: 'buku', romanization: undefined, audio: undefined });
    });

    it('兩面都沒有文字時沒有詞（轉盤與旁邊顯示編號）', () => {
        expect(
            wordOf(card({ image: '/a.webp' }, { audio: '/a.mp3' }), 'id'),
        ).toEqual({ audio: '/a.mp3' });
    });
});

describe('normalizeOptions', () => {
    it('沒有設定時用預設', () => {
        expect(normalizeOptions(undefined)).toEqual(meta.defaultOptions);
    });

    it('0.1 版活動的設定：拿掉的選項略過，先顯示那一面的文字改回目標語', () => {
        expect(
            normalizeOptions({
                startWith: 'back',
                sliceLabel: 'face',
                removeAfterSpin: false,
                autoPlayAudio: true,
            } as Record<string, unknown>),
        ).toEqual({ sliceLabel: 'target', removeAfterSpin: false });
        expect(normalizeOptions({ sliceLabel: 'number' })).toEqual({
            sliceLabel: 'number',
            removeAfterSpin: true,
        });
    });
});
