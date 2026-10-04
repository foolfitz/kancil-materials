import type { Round } from '@kancil-quiz/games-sdk';

export type CardRound = Extract<Round, { shape: 'card' }>;

// 每次至少轉幾圈
export const TURNS = 5;
// 停下的位置在扇形中央附近隨機偏移，最多偏到扇形寬度的幾成（避免停在兩片的交界）
export const JITTER = 0.35;

export interface SpinResult {
    card: CardRound;
    index: number; // 轉盤上的第幾片
    rotation: number; // 轉盤停下時順時針轉過的總角度（度）
    firstTime: boolean; // 這個詞第一次被轉到
}

// 轉盤的進行狀態，不碰 DOM，方便測試。
// 指針在正上方；第 i 片從正上方順時針算起佔 [iθ, (i+1)θ)，θ = 360 / 片數。
export class WheelSession {
    rotation = 0;
    slices: CardRound[];
    landed: CardRound | null = null;
    private readonly viewed = new Set<string>();

    constructor(
        readonly cards: CardRound[],
        private readonly rng: () => number,
        readonly removeAfterSpin: boolean,
    ) {
        this.slices = [...cards];
    }

    get done(): boolean {
        return this.slices.length === 0;
    }

    get viewedCount(): number {
        return this.viewed.size;
    }

    // 轉一次：抽一片並算出停下的角度。上一次轉到的卡還沒關掉時先關掉。轉盤空了回傳 null。
    spin(): SpinResult | null {
        this.dismiss();
        if (this.done) {
            return null;
        }
        const n = this.slices.length;
        const index = Math.min(n - 1, Math.floor(this.rng() * n));
        const jitter = (this.rng() * 2 - 1) * JITTER;
        this.rotation = targetRotation(this.rotation, index, n, jitter);
        const card = this.slices[index];
        this.landed = card;
        const firstTime = !this.viewed.has(card.entryId);
        this.viewed.add(card.entryId);
        return { card, index, rotation: this.rotation, firstTime };
    }

    // 關掉轉到的卡。設定為轉到就拿掉時，從轉盤拿掉。
    dismiss(): void {
        if (this.landed && this.removeAfterSpin) {
            const landed = this.landed;
            this.slices = this.slices.filter((card) => card !== landed);
        }
        this.landed = null;
    }

    // 把拿掉的詞放回轉盤。看過的紀錄保留。
    restart(): void {
        this.slices = [...this.cards];
        this.landed = null;
    }
}

function mod(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

// 從目前的角度順時針再轉 TURNS 圈以上，停在第 index 片（jitter 為偏離扇形中央的比例，-0.5 到 0.5）。
export function targetRotation(
    current: number,
    index: number,
    n: number,
    jitter = 0,
): number {
    const slice = 360 / n;
    // 轉盤順時針轉 R 度後，指針指著轉盤上 -R 度的位置
    const target = mod(-(index + 0.5 + jitter) * slice, 360);
    return current + TURNS * 360 + mod(target - current, 360);
}

// 轉盤轉了 rotation 度時，指針指著第幾片。
export function sliceAt(rotation: number, n: number): number {
    return Math.min(n - 1, Math.floor(mod(-rotation, 360) / (360 / n)));
}

export function cardRounds(rounds: Round[]): CardRound[] {
    return rounds.filter((round): round is CardRound => round.shape === 'card');
}
