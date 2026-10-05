import type { Round } from '@kancil-quiz/games-sdk';

export type CardRound = Extract<Round, { shape: 'card' }>;

// 一頁最多幾張卡：投影時一課的詞（通常 5 到 8 個）一頁放得下，卡片也夠大
export const MAX_PER_PAGE = 12;

// 圖卡牆的進行狀態，不碰 DOM，方便測試。一頁排出多張卡，各自翻面；一張卡第一次翻面時算「看過」。
// 換頁時保留每張卡翻到哪一面。
export class CardWallSession {
    page = 0;
    readonly pages: CardRound[][];
    private readonly flipped = new Set<string>();
    private readonly viewed = new Set<string>();

    constructor(
        readonly cards: CardRound[],
        perPage = MAX_PER_PAGE,
    ) {
        this.pages = paginate(cards, perPage);
    }

    get current(): CardRound[] {
        return this.pages[this.page] ?? [];
    }

    get isFirstPage(): boolean {
        return this.page === 0;
    }

    get isLastPage(): boolean {
        return this.page >= this.pages.length - 1;
    }

    get viewedCount(): number {
        return this.viewed.size;
    }

    // 這一頁的卡是不是都翻過去了（「全部翻面」按鈕要往哪個方向翻）
    get allFlipped(): boolean {
        return this.current.every((card) => this.flipped.has(card.entryId));
    }

    isFlipped(entryId: string): boolean {
        return this.flipped.has(entryId);
    }

    // 翻一張卡。回傳這次翻面讓哪張卡變成「看過」，已經看過就回傳 null。
    flip(entryId: string): string | null {
        if (!this.current.some((card) => card.entryId === entryId)) {
            return null;
        }
        if (this.flipped.has(entryId)) {
            this.flipped.delete(entryId);
        } else {
            this.flipped.add(entryId);
        }
        return this.markViewed(entryId);
    }

    // 這一頁還有沒翻的卡就全部翻過去，否則全部翻回來。回傳這次變成「看過」的卡。
    flipAll(): string[] {
        if (this.allFlipped) {
            for (const card of this.current) {
                this.flipped.delete(card.entryId);
            }
            return [];
        }
        const viewed: string[] = [];
        for (const card of this.current) {
            this.flipped.add(card.entryId);
            const id = this.markViewed(card.entryId);
            if (id) {
                viewed.push(id);
            }
        }
        return viewed;
    }

    nextPage(): boolean {
        if (this.isLastPage) {
            return false;
        }
        this.page++;
        return true;
    }

    prevPage(): boolean {
        if (this.isFirstPage) {
            return false;
        }
        this.page--;
        return true;
    }

    private markViewed(entryId: string): string | null {
        if (this.viewed.has(entryId)) {
            return null;
        }
        this.viewed.add(entryId);
        return entryId;
    }
}

// 分頁，各頁張數盡量平均：13 張分成 7、6，而不是 12、1。
export function paginate<T>(items: T[], max: number): T[][] {
    if (items.length === 0) {
        return [[]];
    }
    const count = Math.ceil(items.length / max);
    const pages: T[][] = [];
    let start = 0;
    for (let i = 0; i < count; i++) {
        const size = Math.ceil((items.length - start) / (count - i));
        pages.push(items.slice(start, start + size));
        start += size;
    }
    return pages;
}

// 一頁 n 張卡、區域 width × height 時，排幾欄卡片最大。卡片寬高比約 4:5（上面是圖、下面是字）。
export interface Layout {
    columns: number;
    rows: number;
    cardWidth: number; // 以理想的長寬比（aspect）算出的卡片寬度，用來比較哪種排法的卡片最大
    cellWidth: number; // 每一格實際的寬與高
    cellHeight: number;
}

// 依張數與可用空間找出卡片最大的排法。有給 minimum 時，先在格子夠寬也夠高的排法裡挑
// （手機橫放時 6 張排成一列太窄，3 欄 2 列的格子雖然比較扁，但每一張都看得清楚）；
// 沒有一種排法放得下才退回整體最大的那一種，由呼叫端改成可以捲動的版面
export function bestColumns(
    n: number,
    width: number,
    height: number,
    gap: number,
    aspect = 0.8,
    minimum?: { width: number; height: number },
): Layout {
    let best: Layout | null = null;
    let bestFitting: Layout | null = null;
    for (let columns = 1; columns <= Math.max(1, n); columns++) {
        const rows = Math.ceil(n / columns);
        const cellWidth = (width - gap * (columns - 1)) / columns;
        const cellHeight = (height - gap * (rows - 1)) / rows;
        const cardWidth = Math.min(cellWidth, cellHeight * aspect);
        const layout = { columns, rows, cardWidth, cellWidth, cellHeight };
        if (!best || cardWidth > best.cardWidth) {
            best = layout;
        }
        if (
            minimum &&
            cellWidth >= minimum.width &&
            cellHeight >= minimum.height &&
            (!bestFitting || cardWidth > bestFitting.cardWidth)
        ) {
            bestFitting = layout;
        }
    }
    return (
        bestFitting ??
        best ?? {
            columns: 1,
            rows: 1,
            cardWidth: width,
            cellWidth: width,
            cellHeight: height,
        }
    );
}

export function cardRounds(rounds: Round[]): CardRound[] {
    return rounds.filter((round): round is CardRound => round.shape === 'card');
}
