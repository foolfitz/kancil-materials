import type { Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import {
    TURNS,
    WheelSession,
    cardRounds,
    sliceAt,
    targetRotation,
} from '../src/session';

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
