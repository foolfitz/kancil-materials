import type {
    Face,
    GameContext,
    GameInstance,
    GameModule,
} from '@kancil-quiz/games-sdk';
import { graphemes } from '@kancil-quiz/text';
import { meta } from './meta';
import type { SpinWheelOptions } from './meta';
import { WheelSession, cardRounds } from './session';
import type { CardRound, SpinResult } from './session';
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
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

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

function renderFace(face: Face): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (face.image) {
        const img = el('img', 'kq-wheel__image');
        img.src = face.image;
        img.alt = face.text ?? '';
        img.draggable = false;
        img.addEventListener('error', () => img.remove(), { once: true });
        parts.push(img);
    }
    if (face.text) {
        parts.push(el('span', 'kq-wheel__text', face.text));
    }
    if (face.romanization) {
        parts.push(el('span', 'kq-wheel__romanization', face.romanization));
    }
    if (parts.length === 0 && face.audio) {
        const icon = el('span', 'kq-wheel__audio-only', '🔊');
        icon.setAttribute('aria-label', '發音');
        parts.push(icon);
    }
    return parts;
}

// 卡片一面的內容。縮放字與圖用的 container 放在這一層，不放在翻面的那一層：
// Safari 中翻面的元素加上 container-type 或 overflow 後，背面不會藏起來
function faceContent(face: Face): HTMLElement {
    const content = el('div', 'kq-wheel__face');
    content.append(...renderFace(face));
    return content;
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
    const options = { ...meta.defaultOptions, ...ctx.options };
    const cards = cardRounds(ctx.rounds);
    const session = new WheelSession(cards, ctx.rng, options.removeAfterSpin);
    const startedAt = performance.now();
    let paused = false;
    let finished = false;
    let spinning = false;
    let flipped = false;
    let spinTimer: ReturnType<typeof setTimeout> | undefined;

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

    // 轉到的卡
    const overlay = el('div', 'kq-wheel__overlay');
    overlay.hidden = true;
    const result = el('button', 'kq-wheel__result');
    result.type = 'button';
    const inner = el('div', 'kq-wheel__inner');
    const first = el('div', 'kq-wheel__side kq-wheel__side--first');
    const second = el('div', 'kq-wheel__side kq-wheel__side--second');
    inner.append(first, second);
    result.append(inner);
    const resultControls = el('div', 'kq-wheel__controls');
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
    resultControls.append(listen, back, again);
    overlay.append(result, resultControls);

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

    stage.append(wrap, empty, overlay);

    const footer = el('div', 'kq-wheel__controls');
    const status = el('span', 'kq-wheel__status');
    const restartButton = el('button', 'kq-wheel__button', '重新開始');
    restartButton.type = 'button';
    const doneButton = el('button', 'kq-wheel__button', '完成 ✓');
    doneButton.type = 'button';
    footer.append(status, restartButton, doneButton);
    root.append(stage, footer);
    host.append(root);

    // [轉到時先顯示的那一面, 翻過來的那一面]
    function sides(card: CardRound): [Face, Face] {
        return options.startWith === 'back'
            ? [card.back, card.front]
            : [card.front, card.back];
    }

    function visibleFace(): Face {
        if (!session.landed) {
            return {};
        }
        const [shown, hidden] = sides(session.landed);
        return flipped ? hidden : shown;
    }

    function play(face: Face): void {
        ctx.audio.stopAll();
        if (face.audio && !paused) {
            void ctx.audio.play(face.audio).catch(() => undefined);
        }
    }

    function label(card: CardRound): string {
        const number = String(cards.indexOf(card) + 1);
        if (options.sliceLabel === 'number') {
            return number;
        }
        const [shown] = sides(card);
        return shown.text ?? shown.romanization ?? number;
    }

    function drawWheel(): void {
        const n = session.slices.length;
        const slice = 360 / Math.max(n, 1);
        const children: SVGElement[] = [];
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

    function showResult(spin: SpinResult): void {
        flipped = false;
        const [shown, hidden] = sides(spin.card);
        first.replaceChildren(faceContent(shown));
        second.replaceChildren(faceContent(hidden));
        updateFlip();
        overlay.dataset.entryId = spin.card.entryId;
        overlay.hidden = false;
        // 最後一個詞：再轉一次就沒有了
        again.textContent =
            session.removeAfterSpin && session.slices.length === 1
                ? '繼續'
                : '再轉一次';
        if (spin.firstTime) {
            ctx.emit({ type: 'viewed', entryId: spin.card.entryId });
        }
        if (options.autoPlayAudio) {
            play(visibleFace());
        }
        result.focus();
    }

    function updateFlip(): void {
        inner.classList.toggle('is-flipped', flipped);
        first.setAttribute('aria-hidden', String(flipped));
        second.setAttribute('aria-hidden', String(!flipped));
        listen.hidden = !visibleFace().audio;
    }

    function flip(): void {
        if (paused || finished || !session.landed) {
            return;
        }
        flipped = !flipped;
        updateFlip();
        if (options.autoPlayAudio) {
            play(visibleFace());
        } else {
            ctx.audio.stopAll();
        }
    }

    // 關掉轉到的卡，回到轉盤；設定為拿掉時重畫轉盤
    function closeResult(): void {
        overlay.hidden = true;
        ctx.audio.stopAll();
        const before = session.slices.length;
        session.dismiss();
        if (session.slices.length !== before) {
            drawWheel();
        }
        updateControls();
    }

    function spin(): void {
        if (paused || finished || spinning) {
            return;
        }
        if (!overlay.hidden) {
            closeResult();
        }
        const spun = session.spin();
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
                spinning = false;
                updateControls();
                showResult(spun);
            },
            instant ? 0 : SPIN_MS + 100,
        );
    }

    function restart(): void {
        if (spinning) {
            return;
        }
        overlay.hidden = true;
        ctx.audio.stopAll();
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
    result.addEventListener('click', flip);
    listen.addEventListener('click', () => play(visibleFace()));
    back.addEventListener('click', closeResult);
    again.addEventListener('click', spin);
    emptyRestart.addEventListener('click', restart);
    restartButton.addEventListener('click', restart);
    doneButton.addEventListener('click', finish);

    function onKey(event: KeyboardEvent): void {
        if (paused || finished || isControl(event.target)) {
            return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (overlay.hidden) {
                spin();
            } else {
                flip();
            }
        }
    }
    document.addEventListener('keydown', onKey);

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
