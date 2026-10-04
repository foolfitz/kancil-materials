import type { Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import { FlashCardSession, cardRounds } from '../src/session';

const rounds: Round[] = [
    {
        shape: 'card',
        entryId: 'e1',
        front: { text: '香蕉' },
        back: { text: 'quả chuối' },
    },
    {
        shape: 'card',
        entryId: 'e2',
        front: { text: '蘋果' },
        back: { text: 'quả táo' },
    },
    {
        shape: 'card',
        entryId: 'e3',
        front: { text: '柳橙' },
        back: { text: 'quả cam' },
    },
];

describe('FlashCardSession', () => {
    it('第一次翻面時才算看過', () => {
        const session = new FlashCardSession(cardRounds(rounds));
        expect(session.viewedCount).toBe(0);

        expect(session.flip()).toBe('e1');
        expect(session.flipped).toBe(true);
        // 翻回來、再翻一次，都不再重複算
        expect(session.flip()).toBeNull();
        expect(session.flip()).toBeNull();
        expect(session.viewedCount).toBe(1);
    });

    it('前後換卡，換卡時回到開頭那一面', () => {
        const session = new FlashCardSession(cardRounds(rounds));
        expect(session.isFirst).toBe(true);
        expect(session.prev()).toBe(false);

        session.flip();
        expect(session.next()).toBe(true);
        expect(session.current?.entryId).toBe('e2');
        expect(session.flipped).toBe(false);

        expect(session.next()).toBe(true);
        expect(session.isLast).toBe(true);
        expect(session.next()).toBe(false);
        expect(session.index).toBe(2);

        expect(session.prev()).toBe(true);
        expect(session.current?.entryId).toBe('e2');
    });

    it('回到看過的卡再翻面，不重複算', () => {
        const session = new FlashCardSession(cardRounds(rounds));
        session.flip();
        session.next();
        session.prev();
        expect(session.flip()).toBeNull();
        session.next();
        expect(session.flip()).toBe('e2');
        expect(session.viewedCount).toBe(2);
    });

    it('只收字卡形狀的題目', () => {
        const session = new FlashCardSession(
            cardRounds([
                ...rounds,
                {
                    shape: 'pair',
                    entryId: 'p1',
                    left: { text: '西瓜' },
                    right: { text: 'quả dưa hấu' },
                },
            ]),
        );
        expect(session.cards).toHaveLength(3);
    });

    it('沒有題目時不會出錯', () => {
        const session = new FlashCardSession([]);
        expect(session.current).toBeUndefined();
        expect(session.flip()).toBeNull();
        expect(session.next()).toBe(false);
    });
});
