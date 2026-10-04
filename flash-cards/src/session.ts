import type { Round } from '@kancil-quiz/games-sdk';

type CardRound = Extract<Round, { shape: 'card' }>;

// 字卡的進行狀態，不碰 DOM，方便測試。可以前後翻閱；一張卡第一次翻面時算「看過」。
export class FlashCardSession {
    index = 0;
    flipped = false;
    private readonly viewed = new Set<string>();

    constructor(readonly cards: CardRound[]) {}

    get current(): CardRound | undefined {
        return this.cards[this.index];
    }

    get isFirst(): boolean {
        return this.index === 0;
    }

    get isLast(): boolean {
        return this.index >= this.cards.length - 1;
    }

    get viewedCount(): number {
        return this.viewed.size;
    }

    // 翻面。回傳這次翻面讓哪張卡變成「看過」，已經看過就回傳 null。
    flip(): string | null {
        const card = this.current;
        if (!card) {
            return null;
        }
        this.flipped = !this.flipped;
        if (this.viewed.has(card.entryId)) {
            return null;
        }
        this.viewed.add(card.entryId);
        return card.entryId;
    }

    // 換卡時一律先顯示開頭的那一面。已經在最後（或第一）張時回傳 false。
    next(): boolean {
        if (this.isLast) {
            return false;
        }
        this.index++;
        this.flipped = false;
        return true;
    }

    prev(): boolean {
        if (this.isFirst) {
            return false;
        }
        this.index--;
        this.flipped = false;
        return true;
    }
}

export function cardRounds(rounds: Round[]): CardRound[] {
    return rounds.filter((round): round is CardRound => round.shape === 'card');
}
