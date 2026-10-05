import type { Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import {
    CardWallSession,
    bestColumns,
    cardRounds,
    paginate,
} from '../src/session';

function cards(n: number): Round[] {
    return Array.from({ length: n }, (_, i) => ({
        shape: 'card',
        entryId: `e${i + 1}`,
        front: { text: `正面 ${i + 1}` },
        back: { text: `背面 ${i + 1}` },
    }));
}

describe('CardWallSession', () => {
    it('每張卡第一次翻面時才算看過，翻回來不重複算', () => {
        const session = new CardWallSession(cardRounds(cards(3)));
        expect(session.flip('e2')).toBe('e2');
        expect(session.isFlipped('e2')).toBe(true);
        expect(session.flip('e2')).toBeNull();
        expect(session.isFlipped('e2')).toBe(false);
        expect(session.viewedCount).toBe(1);
        // 不在這一頁的卡不能翻
        expect(session.flip('e9')).toBeNull();
    });

    it('全部翻面：還有沒翻的就全翻過去，都翻過去了就全翻回來', () => {
        const session = new CardWallSession(cardRounds(cards(3)));
        session.flip('e1');
        expect(session.allFlipped).toBe(false);

        expect(session.flipAll()).toEqual(['e2', 'e3']);
        expect(session.allFlipped).toBe(true);
        expect(session.viewedCount).toBe(3);

        expect(session.flipAll()).toEqual([]);
        expect(['e1', 'e2', 'e3'].map((id) => session.isFlipped(id))).toEqual([
            false,
            false,
            false,
        ]);
    });

    it('超過一頁時分頁，換頁後保留每張卡翻到哪一面', () => {
        const session = new CardWallSession(cardRounds(cards(13)));
        expect(session.pages.map((page) => page.length)).toEqual([7, 6]);
        expect(session.isFirstPage).toBe(true);

        session.flip('e1');
        expect(session.prevPage()).toBe(false);
        expect(session.nextPage()).toBe(true);
        expect(session.current[0].entryId).toBe('e8');
        expect(session.isLastPage).toBe(true);
        expect(session.nextPage()).toBe(false);

        session.prevPage();
        expect(session.isFlipped('e1')).toBe(true);
    });
});

describe('paginate', () => {
    it('各頁張數盡量平均', () => {
        expect(paginate([1, 2, 3], 12)).toEqual([[1, 2, 3]]);
        expect(
            paginate(
                Array.from({ length: 25 }, (_, i) => i),
                12,
            ).map((page) => page.length),
        ).toEqual([9, 8, 8]);
        expect(paginate([], 12)).toEqual([[]]);
    });
});

describe('bestColumns', () => {
    it('依張數與區域的形狀排出最大的卡片', () => {
        // 4 張：投影（寬螢幕）排成一列，iPad 直向排成 2 × 2
        expect(bestColumns(4, 1800, 800, 16)).toMatchObject({
            columns: 4,
            rows: 1,
        });
        expect(bestColumns(4, 740, 850, 16)).toMatchObject({
            columns: 2,
            rows: 2,
        });
        // 投影 12 張：排成 6 欄 2 列
        expect(bestColumns(12, 1800, 800, 16)).toMatchObject({
            columns: 6,
            rows: 2,
        });
        expect(bestColumns(1, 800, 600, 16)).toMatchObject({
            columns: 1,
            rows: 1,
        });
    });

    it('有最小尺寸時，先挑格子夠寬也夠高的排法', () => {
        const minimum = { width: 140, height: 110 };
        // 手機橫放 6 張：排成一列每張只有 123 px 寬，改成 3 欄 2 列
        expect(bestColumns(6, 820, 254, 16, 0.8, minimum)).toMatchObject({
            columns: 3,
            rows: 2,
        });
        // 手機直向 6 張：2 欄 3 列，格子接近正方形也算放得下
        const portrait = bestColumns(6, 351, 531, 16, 0.8, minimum);
        expect(portrait).toMatchObject({ columns: 2, rows: 3 });
        expect(portrait.cellWidth).toBeGreaterThanOrEqual(140);
        expect(portrait.cellHeight).toBeGreaterThanOrEqual(110);
        // 都放不下時回傳整體最大的排法，由呼叫端改成捲動
        expect(
            bestColumns(12, 351, 531, 16, 0.8, minimum).cellWidth,
        ).toBeLessThan(140);
        // 沒有最小尺寸時行為不變
        expect(bestColumns(6, 820, 254, 16)).toMatchObject({
            columns: 6,
            rows: 1,
        });
    });
});
