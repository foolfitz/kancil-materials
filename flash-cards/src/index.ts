import type {
    Face,
    GameContext,
    GameInstance,
    GameModule,
} from '@kancil-quiz/games-sdk';
import { meta } from './meta';
import type { FlashCardsOptions } from './meta';
import { FlashCardSession, cardRounds } from './session';
import './style.css';

export type { FlashCardsOptions } from './meta';

// 水平滑動超過這個距離（px）才算換卡，否則當成點一下翻面
const SWIPE_DISTANCE = 50;

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

function renderFace(face: Face): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (face.image) {
        const img = el('img', 'kq-cards__image');
        img.src = face.image;
        img.alt = face.text ?? '';
        img.draggable = false;
        // 圖片載入失敗時只留文字，不讓畫面壞掉
        img.addEventListener('error', () => img.remove(), { once: true });
        parts.push(img);
    }
    if (face.text) {
        parts.push(el('span', 'kq-cards__text', face.text));
    }
    if (face.romanization) {
        parts.push(el('span', 'kq-cards__romanization', face.romanization));
    }
    if (parts.length === 0 && face.audio) {
        // 這一面只有發音：用喇叭圖示代表，發音由下方的按鈕播放
        const icon = el('span', 'kq-cards__audio-only', '🔊');
        icon.setAttribute('aria-label', '發音');
        parts.push(icon);
    }
    return parts;
}

function isControl(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        target.closest('button, a, input, select, textarea') !== null
    );
}

function mount(
    host: HTMLElement,
    ctx: GameContext<FlashCardsOptions>,
): GameInstance {
    const options = { ...meta.defaultOptions, ...ctx.options };
    const session = new FlashCardSession(cardRounds(ctx.rounds));
    const startedAt = performance.now();
    let paused = false;
    let finished = false;
    let swipeStart: { x: number; y: number } | null = null;
    // 剛滑動過：滑動後瀏覽器可能還會送出 click，不要把它當成翻面。
    // 下一次按下時清除；鍵盤觸發的 click（detail 為 0）不受影響
    let swiped = false;

    const root = el('div', 'kq-cards');
    root.lang = ctx.language;
    const progress = el('div', 'kq-cards__progress');
    const card = el('button', 'kq-cards__card');
    card.type = 'button';
    const inner = el('div', 'kq-cards__inner');
    const first = el('div', 'kq-cards__side kq-cards__side--first');
    const second = el('div', 'kq-cards__side kq-cards__side--second');
    inner.append(first, second);
    card.append(inner);

    const listen = el('button', 'kq-cards__button', '🔊 聽發音');
    listen.type = 'button';
    const controls = el('div', 'kq-cards__controls');
    const prevButton = el('button', 'kq-cards__button', '← 上一張');
    prevButton.type = 'button';
    const flipButton = el('button', 'kq-cards__button', '翻面');
    flipButton.type = 'button';
    const nextButton = el(
        'button',
        'kq-cards__button kq-cards__button--primary',
    );
    nextButton.type = 'button';
    controls.append(prevButton, flipButton, nextButton);
    const hint = el('p', 'kq-cards__hint', '點卡片翻面，左右滑動可以換卡。');
    root.append(progress, card, listen, controls, hint);
    host.append(root);

    // [先顯示的那一面, 翻過來的那一面]
    function sides(): [Face, Face] {
        const current = session.current;
        if (!current) {
            return [{}, {}];
        }
        return options.startWith === 'back'
            ? [current.back, current.front]
            : [current.front, current.back];
    }

    function visibleFace(): Face {
        const [shown, hidden] = sides();
        return session.flipped ? hidden : shown;
    }

    function autoPlay(): void {
        const audio = visibleFace().audio;
        if (options.autoPlayAudio && audio) {
            void ctx.audio.play(audio).catch(() => undefined);
        }
    }

    function updateFlip(): void {
        inner.classList.toggle('is-flipped', session.flipped);
        first.setAttribute('aria-hidden', String(session.flipped));
        second.setAttribute('aria-hidden', String(!session.flipped));
        listen.hidden = !visibleFace().audio;
    }

    function showCard(direction: 1 | -1 | 0): void {
        const [shown, hidden] = sides();
        first.replaceChildren(...renderFace(shown));
        second.replaceChildren(...renderFace(hidden));

        // 換卡時直接回到開頭那一面，不播放翻面動畫，以免轉動途中露出新卡的另一面
        inner.classList.add('is-instant');
        updateFlip();
        void inner.offsetWidth;
        inner.classList.remove('is-instant');

        card.classList.remove('is-entering-next', 'is-entering-prev');
        if (direction !== 0) {
            void card.offsetWidth;
            card.classList.add(
                direction === 1 ? 'is-entering-next' : 'is-entering-prev',
            );
        }

        progress.textContent = `第 ${session.index + 1} / ${session.cards.length} 張`;
        prevButton.disabled = session.isFirst;
        nextButton.textContent = session.isLast ? '完成 ✓' : '下一張 →';
        autoPlay();
    }

    function flip(): void {
        if (paused || finished || !session.current) {
            return;
        }
        ctx.audio.stopAll();
        const viewed = session.flip();
        if (viewed) {
            ctx.emit({ type: 'viewed', entryId: viewed });
        }
        updateFlip();
        autoPlay();
    }

    function go(step: 1 | -1): void {
        if (paused || finished) {
            return;
        }
        if (step === 1 && session.isLast) {
            finish();
            return;
        }
        if (step === 1 ? session.next() : session.prev()) {
            ctx.audio.stopAll();
            showCard(step);
        }
    }

    function finish(): void {
        finished = true;
        ctx.audio.stopAll();
        ctx.emit({
            type: 'completed',
            durationMs: Math.round(performance.now() - startedAt),
        });
    }

    card.addEventListener('click', (event) => {
        if (event.detail > 0 && swiped) {
            swiped = false;
            return;
        }
        flip();
    });
    card.addEventListener('pointerdown', (event) => {
        swiped = false;
        swipeStart = { x: event.clientX, y: event.clientY };
    });
    card.addEventListener('pointercancel', () => {
        swipeStart = null;
    });
    card.addEventListener('pointerup', (event) => {
        if (!swipeStart) {
            return;
        }
        const dx = event.clientX - swipeStart.x;
        const dy = event.clientY - swipeStart.y;
        swipeStart = null;
        if (
            Math.abs(dx) >= SWIPE_DISTANCE &&
            Math.abs(dx) > 1.5 * Math.abs(dy)
        ) {
            swiped = true;
            go(dx < 0 ? 1 : -1);
        }
    });
    listen.addEventListener('click', () => {
        const audio = visibleFace().audio;
        if (audio && !paused) {
            ctx.audio.stopAll();
            void ctx.audio.play(audio).catch(() => undefined);
        }
    });
    prevButton.addEventListener('click', () => go(-1));
    flipButton.addEventListener('click', flip);
    nextButton.addEventListener('click', () => go(1));

    function onKey(event: KeyboardEvent): void {
        if (paused || finished) {
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            go(1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            go(-1);
        } else if (
            (event.key === ' ' || event.key === 'Enter') &&
            // 焦點在按鈕上時由按鈕自己處理
            !isControl(event.target)
        ) {
            event.preventDefault();
            flip();
        }
    }
    document.addEventListener('keydown', onKey);

    ctx.emit({ type: 'started' });
    if (session.current) {
        showCard(0);
    } else {
        finish();
    }

    return {
        destroy() {
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

export const flashCards: GameModule<FlashCardsOptions> = { ...meta, mount };
export default flashCards;
