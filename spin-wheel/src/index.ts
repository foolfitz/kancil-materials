import type {
    GameContext,
    GameInstance,
    GameModule,
} from '@kancil-quiz/games-sdk';
import { graphemes } from '@kancil-quiz/text';
import { meta, normalizeOptions } from './meta';
import type { SpinWheelOptions } from './meta';
import { WheelSession, cardRounds, wordOf } from './session';
import type { CardRound, SpinResult, Word } from './session';
import './style.css';

export type { SpinWheelOptions } from './meta';

const SVG = 'http://www.w3.org/2000/svg';
// 轉一次的時間（毫秒）；系統設定減少動態效果時直接停在結果
const SPIN_MS = 4000;
// 轉盤半徑（viewBox 為 -100 到 100）、中央按鈕的半徑
const RADIUS = 96;
const HUB = 22;
// 扇形的顏色，文字一律用深色
const COLORS = [
    '#fde68a',
    '#bfdbfe',
    '#bbf7d0',
    '#fecaca',
    '#ddd6fe',
    '#fed7aa',
    '#a5f3fc',
    '#fbcfe8',
];
// 全形字（中文、日文假名、韓文等）約 1 個字寬，其他約 0.6 個
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
// 停下後，轉到的那一片先亮一下，再跳出放大的詞（毫秒）
const LANDED_MS = 400;
// 放大的詞的字級（px）：最大是放詞的地方高度的幾成，最小多少
const WORD_HEIGHT = 0.6;
const WORD_MIN = 18;

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function svg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, String(value));
    }
    return node;
}

// 從正上方順時針 angle 度、半徑 r 的點
function point(angle: number, r: number): string {
    const rad = (angle * Math.PI) / 180;
    return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`;
}

// 扇形上的文字：依可用的長度與寬度縮小字級，太長時以「…」截斷（以字素為單位）
function fitLabel(
    text: string,
    language: string,
    maxSize: number,
    length: number,
): { text: string; size: number } {
    const parts = graphemes(text, language);
    const em = (list: string[]) =>
        list.reduce((sum, g) => sum + (WIDE.test(g) ? 1 : 0.6), 0);
    const minSize = 5;
    const size = Math.min(maxSize, length / Math.max(em(parts), 1));
    if (size >= minSize) {
        return { text, size };
    }
    const kept: string[] = [];
    for (const part of parts) {
        if (em([...kept, part, '…']) * minSize > length) {
            break;
        }
        kept.push(part);
    }
    return { text: `${kept.join('')}…`, size: minSize };
}

function isControl(target: EventTarget | null): boolean {
    return (
        target instanceof Element &&
        target.closest('button, a, input, select, textarea') !== null
    );
}

function mount(
    host: HTMLElement,
    ctx: GameContext<SpinWheelOptions>,
): GameInstance {
    const options = normalizeOptions(ctx.options);
    const cards = cardRounds(ctx.rounds);
    const words = new Map<CardRound, Word>(
        cards.map((card) => [card, wordOf(card, ctx.language)]),
    );
    const session = new WheelSession(cards, ctx.rng, options.removeAfterSpin);
    const startedAt = performance.now();
    let paused = false;
    let finished = false;
    let spinning = false;
    let spinTimer: ReturnType<typeof setTimeout> | undefined;
    // 目前畫在轉盤上的扇形與顏色，順序同 session.slices
    let groups: SVGGElement[] = [];
    let colors: string[] = [];
    let landedAudio: string | undefined;

    const root = el('div', 'kq-wheel');
    root.lang = ctx.language;
    const stage = el('div', 'kq-wheel__stage');
    const wrap = el('div', 'kq-wheel__wrap');
    const pointer = el('div', 'kq-wheel__pointer');
    pointer.setAttribute('aria-hidden', 'true');
    const disc = el('div', 'kq-wheel__disc');
    const wheel = svg('svg', {
        class: 'kq-wheel__svg',
        viewBox: '-100 -100 200 200',
        role: 'img',
        'aria-label': '轉盤',
    });
    disc.append(wheel);
    const hub = el('button', 'kq-wheel__hub', '轉！');
    hub.type = 'button';
    wrap.append(disc, pointer, hub);

    // 轉到的詞：蓋在轉盤上的 modal，只有放大的詞，不翻面
    const modal = el('div', 'kq-wheel__modal');
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', '轉到的詞');
    const card = el('div', 'kq-wheel__card');
    const wordBox = el('div', 'kq-wheel__word');
    const wordInner = el('div', 'kq-wheel__word-inner');
    const wordText = el('span', 'kq-wheel__word-text');
    const romanization = el('span', 'kq-wheel__romanization');
    wordInner.append(wordText, romanization);
    wordBox.append(wordInner);
    card.append(wordBox);
    const modalControls = el('div', 'kq-wheel__controls');
    // 有音檔才出現
    const listen = el('button', 'kq-wheel__button', '🔊 聽發音');
    listen.type = 'button';
    const back = el('button', 'kq-wheel__button', '回到轉盤');
    back.type = 'button';
    const again = el(
        'button',
        'kq-wheel__button kq-wheel__button--primary',
        '再轉一次',
    );
    again.type = 'button';
    modalControls.append(listen, back, again);
    modal.append(card, modalControls);

    // 全部轉完
    const empty = el('div', 'kq-wheel__empty');
    empty.hidden = true;
    const emptyTitle = el('p', 'kq-wheel__empty-title', '全部轉完了！');
    const emptyRestart = el(
        'button',
        'kq-wheel__button kq-wheel__button--primary',
        '重新開始',
    );
    emptyRestart.type = 'button';
    empty.append(emptyTitle, emptyRestart);

    stage.append(wrap, empty, modal);

    const footer = el('div', 'kq-wheel__controls');
    const status = el('span', 'kq-wheel__status');
    const restartButton = el('button', 'kq-wheel__button', '重新開始');
    restartButton.type = 'button';
    const doneButton = el('button', 'kq-wheel__button', '完成 ✓');
    doneButton.type = 'button';
    footer.append(status, restartButton, doneButton);
    root.append(stage, footer);
    host.append(root);

    function number(card: CardRound): string {
        return String(cards.indexOf(card) + 1);
    }

    function label(card: CardRound): string {
        return options.sliceLabel === 'number'
            ? number(card)
            : (words.get(card)?.text ?? number(card));
    }

    function drawWheel(): void {
        const n = session.slices.length;
        const slice = 360 / Math.max(n, 1);
        const children: SVGElement[] = [];
        groups = [];
        colors = [];
        // 扇形中央（半徑約 0.6 處）的寬度，限制字級
        const width = 2 * 0.6 * RADIUS * Math.sin((Math.PI * slice) / 360);
        const maxSize = Math.min(16, n === 1 ? 16 : width * 0.7);
        session.slices.forEach((card, i) => {
            let color = COLORS[i % COLORS.length];
            // 最後一片與第一片相鄰，避免同色
            if (i === n - 1 && n > 1 && i % COLORS.length === 0) {
                color = COLORS[1];
            }
            const group = svg('g', {
                class: 'kq-wheel__slice',
                'data-entry-id': card.entryId,
            });
            const shape =
                n === 1
                    ? svg('circle', { cx: 0, cy: 0, r: RADIUS, fill: color })
                    : svg('path', {
                          d: `M0 0 L${point(i * slice, RADIUS)} A${RADIUS} ${RADIUS} 0 ${slice > 180 ? 1 : 0} 1 ${point((i + 1) * slice, RADIUS)} Z`,
                          fill: color,
                      });
            shape.setAttribute('data-entry-id', card.entryId);
            group.append(shape);

            const center = (i + 0.5) * slice;
            const fitted = fitLabel(
                label(card),
                ctx.language,
                maxSize,
                0.88 * RADIUS - HUB - 6,
            );
            // 文字沿半徑排，左半邊轉 180 度，免得上下顛倒
            const leftHalf = center > 180;
            const text = svg('text', {
                class: 'kq-wheel__label',
                x: leftHalf ? -0.88 * RADIUS : 0.88 * RADIUS,
                y: 0,
                'text-anchor': leftHalf ? 'start' : 'end',
                'dominant-baseline': 'central',
                'font-size': fitted.size.toFixed(2),
                transform: `rotate(${leftHalf ? center + 90 : center - 90})`,
            });
            text.textContent = fitted.text;
            group.append(text);
            children.push(group);
            groups.push(group);
            colors.push(color);
        });
        children.push(
            svg('circle', {
                class: 'kq-wheel__rim',
                cx: 0,
                cy: 0,
                r: RADIUS,
                fill: 'none',
            }),
        );
        wheel.replaceChildren(...children);
    }

    function updateControls(): void {
        const removed = session.slices.length < cards.length;
        status.textContent = `轉盤上有 ${session.slices.length} 個詞`;
        restartButton.hidden = !removed;
        hub.disabled = spinning || session.done;
        wrap.hidden = session.done;
        empty.hidden = !session.done;
        doneButton.classList.toggle('kq-wheel__button--primary', session.done);
    }

    // 放大的詞用放得下的最大字級。單字不從中間斷開，最小字級還放不下時才斷
    function fitWord(): void {
        const height = wordBox.clientHeight;
        if (modal.hidden || height === 0) {
            return;
        }
        wordInner.classList.remove('is-tight');
        // 單字比寬度長時，詞（置中的 flex 項目）會比外框寬
        const fits = () =>
            wordInner.offsetHeight <= height &&
            Math.max(wordText.offsetWidth, romanization.offsetWidth) <=
                wordInner.clientWidth;
        let size = Math.max(WORD_MIN, height * WORD_HEIGHT);
        wordInner.style.fontSize = `${size}px`;
        while (size > WORD_MIN && !fits()) {
            size = Math.max(WORD_MIN, size * 0.9);
            wordInner.style.fontSize = `${size}px`;
        }
        if (!fits()) {
            wordInner.classList.add('is-tight');
        }
    }

    // 停下後：轉到的那一片亮著、其他變暗
    function markLanded(spun: SpinResult): void {
        groups[spun.index]?.classList.add('is-landed');
        wheel.classList.add('has-landed');
    }

    function clearLanded(): void {
        groups.forEach((group) => group.classList.remove('is-landed'));
        wheel.classList.remove('has-landed');
    }

    // 跳出放大的詞。發音不自動播放：學生先念，再按「🔊 聽發音」對答案
    function showWord(spun: SpinResult): void {
        const word = words.get(spun.card) ?? {};
        card.style.setProperty('--kq-wheel-landed', colors[spun.index]);
        modal.dataset.entryId = spun.card.entryId;
        wordText.textContent = word.text ?? number(spun.card);
        romanization.textContent = word.romanization ?? '';
        romanization.hidden = !word.romanization;
        landedAudio = word.audio;
        listen.hidden = !landedAudio;
        // 最後一個詞：再轉一次就沒有了
        again.textContent =
            session.removeAfterSpin && session.slices.length === 1
                ? '繼續'
                : '再轉一次';
        modal.hidden = false;
        fitWord();
        if (spun.firstTime) {
            ctx.emit({ type: 'viewed', entryId: spun.card.entryId });
        }
        again.focus();
    }

    function closeWord(): void {
        modal.hidden = true;
        ctx.audio.stopAll();
    }

    function playLanded(): void {
        ctx.audio.stopAll();
        if (landedAudio && !paused) {
            void ctx.audio.play(landedAudio).catch(() => undefined);
        }
    }

    function spin(): void {
        if (paused || finished || spinning) {
            return;
        }
        closeWord();
        clearLanded();
        // 上一次轉到的詞在這時拿掉（設定為拿掉時）
        const before = session.slices.length;
        const spun = session.spin();
        if (session.slices.length !== before) {
            drawWheel();
        }
        if (!spun) {
            updateControls();
            return;
        }
        spinning = true;
        updateControls();
        const instant = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;
        disc.style.transitionDuration = instant ? '0ms' : `${SPIN_MS}ms`;
        disc.style.transform = `rotate(${spun.rotation}deg)`;
        wrap.dataset.rotation = String(spun.rotation);
        spinTimer = setTimeout(
            () => {
                markLanded(spun);
                spinTimer = setTimeout(() => {
                    spinning = false;
                    updateControls();
                    showWord(spun);
                }, LANDED_MS);
            },
            instant ? 0 : SPIN_MS + 100,
        );
    }

    function restart(): void {
        if (spinning) {
            return;
        }
        closeWord();
        session.restart();
        drawWheel();
        updateControls();
    }

    function finish(): void {
        if (finished) {
            return;
        }
        finished = true;
        clearTimeout(spinTimer);
        ctx.audio.stopAll();
        ctx.emit({
            type: 'completed',
            durationMs: Math.round(performance.now() - startedAt),
        });
    }

    hub.addEventListener('click', spin);
    listen.addEventListener('click', playLanded);
    back.addEventListener('click', closeWord);
    again.addEventListener('click', spin);
    // 點 modal 的空白處（詞以外）回到轉盤
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeWord();
        }
    });
    emptyRestart.addEventListener('click', restart);
    restartButton.addEventListener('click', restart);
    doneButton.addEventListener('click', finish);

    function onKey(event: KeyboardEvent): void {
        if (paused || finished) {
            return;
        }
        if (event.key === 'Escape' && !modal.hidden) {
            closeWord();
            return;
        }
        if (isControl(event.target)) {
            return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            spin();
        }
    }
    document.addEventListener('keydown', onKey);

    // 畫面大小改變（轉向、調整視窗）時，放大的詞跟著調整字級
    const resize = new ResizeObserver(() => fitWord());
    resize.observe(wordBox);

    ctx.emit({ type: 'started' });
    if (cards.length > 0) {
        drawWheel();
        updateControls();
    } else {
        finish();
    }

    return {
        destroy() {
            clearTimeout(spinTimer);
            resize.disconnect();
            document.removeEventListener('keydown', onKey);
            ctx.audio.stopAll();
            root.remove();
        },
        pause() {
            paused = true;
            ctx.audio.stopAll();
        },
        resume() {
            paused = false;
        },
    };
}

export const spinWheel: GameModule<SpinWheelOptions> = { ...meta, mount };
export default spinWheel;
