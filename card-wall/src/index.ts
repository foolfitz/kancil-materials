import type {
    Face,
    GameContext,
    GameInstance,
    GameModule,
} from '@kancil-quiz/games-sdk';
import { meta } from './meta';
import type { CardWallOptions } from './meta';
import { CardWallSession, bestColumns, cardRounds } from './session';
import type { CardRound } from './session';
import './style.css';

export type { CardWallOptions } from './meta';

// 卡片之間的間距（px），與 style.css 的 --kq-wall-gap 一致
const GAP = 16;
// 卡片寬度小於這個值時改成可以捲動的版面，不再硬塞進一個畫面
const MIN_CARD_WIDTH = 140;

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
        const img = el('img', 'kq-wall__image');
        img.src = face.image;
        img.alt = face.text ?? '';
        img.draggable = false;
        // 圖片載入失敗時只留文字，不讓畫面壞掉
        img.addEventListener('error', () => img.remove(), { once: true });
        parts.push(img);
    }
    if (face.text) {
        parts.push(el('span', 'kq-wall__text', face.text));
    }
    if (face.romanization) {
        parts.push(el('span', 'kq-wall__romanization', face.romanization));
    }
    if (parts.length === 0 && face.audio) {
        const icon = el('span', 'kq-wall__audio-only', '🔊');
        icon.setAttribute('aria-label', '發音');
        parts.push(icon);
    }
    return parts;
}

// 卡片本身是按鈕，所以只排除會用到方向鍵的輸入欄位
// 卡片一面的內容。縮放字與圖用的 container 放在這一層，不放在翻面的那一層：
// Safari 中翻面的元素加上 container-type 或 overflow 後，背面不會藏起來
function faceContent(face: Face): HTMLElement {
    const content = el('div', 'kq-wall__face');
    content.append(...renderFace(face));
    return content;
}

function isTextInput(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        target.closest('input, select, textarea') !== null
    );
}

function mount(
    host: HTMLElement,
    ctx: GameContext<CardWallOptions>,
): GameInstance {
    const options = { ...meta.defaultOptions, ...ctx.options };
    const session = new CardWallSession(cardRounds(ctx.rounds));
    const startedAt = performance.now();
    let paused = false;
    let finished = false;

    const root = el('div', 'kq-wall');
    root.lang = ctx.language;
    const progress = el('div', 'kq-wall__progress');
    const grid = el('ul', 'kq-wall__grid');
    const controls = el('div', 'kq-wall__controls');
    const prevButton = el('button', 'kq-wall__button', '← 上一頁');
    prevButton.type = 'button';
    const flipAllButton = el('button', 'kq-wall__button');
    flipAllButton.type = 'button';
    const nextButton = el('button', 'kq-wall__button', '下一頁 →');
    nextButton.type = 'button';
    // 最後一頁才出現，橘色並與其他按鈕隔開，免得當成「下一頁」一直按（卡片要盡量大，所以不另佔一列）
    const replayButton = el(
        'button',
        'kq-wall__button kq-wall__button--replay',
        '↻ 再玩一次',
    );
    replayButton.type = 'button';
    controls.append(prevButton, flipAllButton, nextButton, replayButton);
    root.append(progress, grid, controls);
    host.append(root);

    // [先顯示的那一面, 翻過來的那一面]
    function sides(card: CardRound): [Face, Face] {
        return options.startWith === 'back'
            ? [card.back, card.front]
            : [card.front, card.back];
    }

    function visibleFace(card: CardRound): Face {
        const [shown, hidden] = sides(card);
        return session.isFlipped(card.entryId) ? hidden : shown;
    }

    function play(face: Face): void {
        if (face.audio && !paused) {
            ctx.audio.stopAll();
            void ctx.audio.play(face.audio).catch(() => undefined);
        }
    }

    // 每張卡的元素，換頁時重建
    const cells = new Map<
        string,
        {
            inner: HTMLElement;
            first: HTMLElement;
            second: HTMLElement;
            listen: HTMLButtonElement;
        }
    >();

    function updateCard(card: CardRound): void {
        const cell = cells.get(card.entryId);
        if (!cell) {
            return;
        }
        const flipped = session.isFlipped(card.entryId);
        cell.inner.classList.toggle('is-flipped', flipped);
        cell.first.setAttribute('aria-hidden', String(flipped));
        cell.second.setAttribute('aria-hidden', String(!flipped));
        cell.listen.hidden = !visibleFace(card).audio;
    }

    function updateControls(): void {
        const many = session.pages.length > 1;
        progress.hidden = !many;
        progress.textContent = `第 ${session.page + 1} / ${session.pages.length} 頁`;
        prevButton.hidden = !many;
        nextButton.hidden = !many;
        prevButton.disabled = session.isFirstPage;
        nextButton.disabled = session.isLastPage;
        // 看到最後一頁才能重新開始（docs/SPEC.md 7.2 的 replay）
        replayButton.hidden = !session.isLastPage;
        flipAllButton.textContent = session.allFlipped
            ? '全部翻回來'
            : '全部翻面';
    }

    function showPage(): void {
        cells.clear();
        grid.replaceChildren(
            ...session.current.map((card) => {
                const item = el('li', 'kq-wall__cell');
                item.dataset.entryId = card.entryId;
                const button = el('button', 'kq-wall__card');
                button.type = 'button';
                const inner = el('div', 'kq-wall__inner');
                const [shown, hidden] = sides(card);
                const first = el('div', 'kq-wall__side kq-wall__side--first');
                first.append(faceContent(shown));
                const second = el('div', 'kq-wall__side kq-wall__side--second');
                second.append(faceContent(hidden));
                inner.append(first, second);
                button.append(inner);
                button.addEventListener('click', () => flip(card));

                const listen = el('button', 'kq-wall__listen', '🔊');
                listen.type = 'button';
                listen.setAttribute('aria-label', '聽發音');
                listen.addEventListener('click', () => play(visibleFace(card)));

                item.append(button, listen);
                cells.set(card.entryId, { inner, first, second, listen });
                return item;
            }),
        );
        for (const card of session.current) {
            updateCard(card);
        }
        updateControls();
        layout();
    }

    // 依這一頁的張數與可用空間決定欄數，讓卡片盡量大又不必捲動
    function layout(): void {
        const n = session.current.length;
        const { clientWidth: width, clientHeight: height } = grid;
        if (n === 0 || width === 0 || height === 0) {
            return;
        }
        const best = bestColumns(n, width, height, GAP);
        if (best.cardWidth >= MIN_CARD_WIDTH) {
            grid.classList.remove('is-scrolling');
            grid.style.setProperty('--kq-wall-columns', String(best.columns));
            grid.style.setProperty('--kq-wall-rows', String(best.rows));
        } else {
            // 空間太小（例如手機橫放）：照寬度排，可以上下捲動
            const columns = Math.max(
                1,
                Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)),
            );
            grid.classList.add('is-scrolling');
            grid.style.setProperty('--kq-wall-columns', String(columns));
            grid.style.removeProperty('--kq-wall-rows');
        }
    }

    function flip(card: CardRound): void {
        if (paused || finished) {
            return;
        }
        const viewed = session.flip(card.entryId);
        if (viewed) {
            ctx.emit({ type: 'viewed', entryId: viewed });
        }
        updateCard(card);
        updateControls();
        if (options.autoPlayAudio) {
            play(visibleFace(card));
        } else {
            ctx.audio.stopAll();
        }
    }

    function flipAll(): void {
        if (paused || finished) {
            return;
        }
        ctx.audio.stopAll();
        for (const id of session.flipAll()) {
            ctx.emit({ type: 'viewed', entryId: id });
        }
        for (const card of session.current) {
            updateCard(card);
        }
        updateControls();
    }

    function go(step: 1 | -1): void {
        if (paused || finished) {
            return;
        }
        if (step === 1 ? session.nextPage() : session.prevPage()) {
            ctx.audio.stopAll();
            showPage();
        }
    }

    // replay：「再玩一次」，宿主不顯示結果頁，直接重新開始
    function finish(replay = false): void {
        if (finished) {
            return;
        }
        finished = true;
        ctx.audio.stopAll();
        ctx.emit({
            type: 'completed',
            durationMs: Math.round(performance.now() - startedAt),
            ...(replay ? { replay } : {}),
        });
    }

    prevButton.addEventListener('click', () => go(-1));
    nextButton.addEventListener('click', () => go(1));
    flipAllButton.addEventListener('click', flipAll);
    replayButton.addEventListener('click', () => {
        if (!paused) {
            finish(true);
        }
    });

    function onKey(event: KeyboardEvent): void {
        if (paused || finished || isTextInput(event.target)) {
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            go(1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            go(-1);
        }
    }
    document.addEventListener('keydown', onKey);

    const resize = new ResizeObserver(() => layout());
    resize.observe(grid);

    ctx.emit({ type: 'started' });
    if (session.cards.length > 0) {
        showPage();
    } else {
        finish();
    }

    return {
        destroy() {
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

export const cardWall: GameModule<CardWallOptions> = { ...meta, mount };
export default cardWall;
