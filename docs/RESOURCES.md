# 可參考的開源資源（2026-11-23 調查）

來源：網頁版 Neon（對話 https://gemini.google.com/u/1/app/a331e54b5b2e90c6）。「查證」欄是 Claude 用 npm、GitHub API 或本機 node_modules 另外確認過的；沒寫的都是 Neon 說的，**未確認**。

## 結論
- 沒有現成的「一隻手＝一隻完整 2D 角色」開源專案。布袋戲數位化的學術案例、展覽都沒有公開程式碼。這個專案確實少有參考對象，靠通用工具自己組。
- 最值得先試的三樣：
  1. **PixiJS 8 內建 `MeshRope`／`PerspectiveMesh`**：讓袖子、披風自然彎曲，轉身時有透視感。不用加套件。
  2. **One Euro Filter**：慢的時候強力去抖、快的時候低延遲，可以取代現在的固定 EMA。
  3. **Kenney 粒子貼圖＋Pixi 8 粒子發射器**：補煙、火花、光暈的質感。

## 清單

| 項目 | 用途 | 授權 | 查證 |
| :--- | :--- | :--- | :--- |
| PixiJS 8 `MeshRope`、`PerspectiveMesh` | 袖子、披風、劍氣拖尾的彎曲；2.5D 轉身 | 隨 PixiJS（MIT） | 本機 `pixi.js` 8.22.0 有這兩個類別 |
| `@webarkit/oneeurofilter-ts` 0.3.0 | 關鍵點去抖（One Euro Filter） | **LGPL-3.0**（商用要注意；演算法很短，也可以自己寫） | npm 確認版本與授權，2026-11-01 更新 |
| MediaPipe `worldLandmarks` | 公尺單位的 3D 手部座標，算掌心朝向、手指彎曲角，翻手時可能比影像座標準 | Apache-2.0（MediaPipe） | 本機 `tasks-vision` 型別檔有 `worldLandmarks`；**翻手時準不準未測** |
| MediaPipe GestureRecognizer＋Model Maker | 自訂手勢模型（每種約 100 張照片，在 Colab 訓練） | — | 未確認；要開 Colab，花錢前要老闆同意 |
| Kalidokit 1.1.5 | MediaPipe 關鍵點轉骨骼角度（VTuber 用），可參考手部角度算法 | MIT | GitHub：2025-08 有更新 |
| ShadowLite | MediaPipe 驅動 2D 皮影戲部件（Python），用最少關節驅動部件的思路可借鏡 | MIT | GitHub 存在，2025-10 更新 |
| `spd789562/pixi-v8-particle-emitter` | Pixi 8 版粒子發射器（舊 `@pixi/particle-emitter` 不支援 Pixi 8） | MIT | GitHub 存在，2026-06 更新 |
| Kenney Particle Pack | 80 張粒子貼圖（煙、火花、光暈、衝擊環） | Neon 說 CC0；GitHub repo 授權欄未標 | **授權待到 kenney.nl 原頁確認** |
| itch.io CC0 VFX（劍光、刀痕、爆炸序列幀） | 劍氣、命中特效 | 各包不同，逐包確認 | 未確認 |
| `@esotericsoftware/spine-pixi-v8` 4.3.13 | 正式骨架動畫（網格權重、預製連招） | Spine 授權（商用要買 Spine Editor） | npm 確認；先不用 |

## 布袋戲數位化（只有參考價值，沒有公開程式碼）
- 臺科大智慧手套記錄操偶手勢：設計學報 https://www.jodesign.org.tw/index.php/JODesign/article/view/1980/753
- 國美館 VR《未來布袋戲劇場》、文策院《功名掌上尋》（動態捕捉＋全息投影）

## 對我們的困難，Neon 的建議（未驗證）
- 快速揮手跟丟：跟丟的 100～200ms 內，用最後幾幀的速度外推位置（我們的直劈已經改成「跟丟就算」）。
- 手翻面認不出：改用 `worldLandmarks` 算 3D 關節角；側轉太多時暫時鎖住偶頭角度（我們已經做了戲偶鎖定）。

## 3D 路線（方案 C）調查（2026-11-23，網頁版 Neon，對話 https://gemini.google.com/u/1/app/556f55111db59d96）

| 項目 | Neon 說 | 查證 |
| :--- | :--- | :--- |
| `@pixiv/three-vrm` | VRM 執行階段，內建 MToon 卡通著色、SpringBone 頭髮衣物骨鏈物理；MIT | npm：3.5.5、MIT、2026-07-09 更新、peer `three >=0.137` ✅ |
| VRM 要求人形骨架（含腿） | 布袋戲偶沒腿 → 放不綁權重的隱藏腿骨通過匯出驗證 | 未確認（合理，待實作時查規格） |
| PixiJS＋Three.js 共存 | 官方指南：共用 WebGL context，每幀 `resetState()`；或兩個 canvas 疊層 | pixijs.com 指南頁存在、有提到 resetState ✅ |
| 雙 canvas 錄影 | 隱藏 2D canvas 每幀 drawImage 兩層再 captureStream | 未實測 |
| Kalidokit | Neon 說已 deprecated | **不完全對**：GitHub 未封存、2025-08 還有推送；npm 最後版本 1.1.5 是 2022 年。單手當整尊偶本來就要自己寫驅動數學 |
| 手驅動骨架 | 用 worldLandmarks 的 0、5、17 建掌心正交基底 → 四元數驅動身體；食指轉進掌心座標算頭的 yaw/pitch；拇指、中指 `setFromUnitVectors` 驅動兩臂；SLERP 或 One Euro 去抖 | 做法合理，未實測 |
| 物理 | SpringBone 骨鏈（頭髮、寬袖、披帛各 3～5 節＋碰撞體）；頂點級布料模擬太重 | 未實測；Neon 說手機瓶頸在 MediaPipe 不在物理 |
| Hunyuan3D 2.0（2D 圖生 3D） | 4060 Ti 16GB 壓線可跑、支援多視圖 | **授權比 Neon 說的嚴**：LICENSE 是「Tencent Hunyuan 3D 2.0 Community License」，有地區排除（歐盟、英國、南韓）和月活躍用戶門檻條款，商用前要細讀 |
| TRELLIS | 微軟，可本機跑 | LICENSE 是 MIT ✅（Neon 說部分 CUDA 子模組另有授權，未確認） |
| Tripo、Meshy | 雲端，Pro 約 US$20／月可商用 | 未確認（要花錢，需老闆同意） |
| VRoid Studio | 免費、可商用、原生 VRM、動漫臉 | 未確認授權 |

Neon 的結論：VRM＋three-vrm；臉和身體用 VRoid／Blender 做（AI 生的動漫臉容易恐怖谷、網格沒有乾淨佈線，綁骨會破面），AI 生 3D 只拿來做頭冠、肩甲、兵器等配件；先用雙 canvas 疊層沿用現有 PixiJS 特效。最大風險：寬袖與頭髮的穿模、破面。
