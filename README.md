# kancil-materials

[Kancil Quiz](https://github.com/foolfitz/kancil-quiz) 內建的互動教材（不計分）：

| 目錄           | 套件                            | 教材   |
| -------------- | ------------------------------- | ------ |
| `flash-cards/` | `@kancil-quiz/game-flash-cards` | 字卡   |
| `card-wall/`   | `@kancil-quiz/game-card-wall`   | 圖卡牆 |
| `spin-wheel/`  | `@kancil-quiz/game-spin-wheel`  | 轉盤   |

計分的遊戲（選擇題、配對）在 [kancil-games](https://github.com/foolfitz/kancil-games)；可以單獨執行的迷宮問答在 [maze-quiz](https://github.com/foolfitz/maze-quiz)。

## 只能在 Kancil Quiz 裡面使用

這個 repo 沒有自己的建置與測試設定。教材用到平台的 `@kancil-quiz/games-sdk`、`@kancil-quiz/text`，以 git submodule 掛在 kancil-quiz 的 `packages/games/kancil-materials/`，在那裡修改、測試與建置。流程見 kancil-quiz 的 `CLAUDE.md`。

遊戲模組的介面與各教材的規則在 kancil-quiz 的 `docs/SPEC.md` 7.2 與 7.5。

## 授權

AGPL-3.0-or-later，與 Kancil Quiz 相同，全文見 `LICENSE`。
