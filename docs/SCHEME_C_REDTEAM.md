### 1. 致命盲點與反例（哪裡最可能線上炸掉、爆額度或踩權限紅線）

#### A. 單手驅動 VRM 骨架的四大崩潰姿勢（對應關鍵問題 1）
1. **側手 90° 正交基底退化與 Z 軸正負翻跳（最致命）**
   - **反例**：方案目標是「流暢側面與轉身」，但當掌心轉至側面（刀手姿勢，相對鏡頭約 75°–105°）時，MediaPipe 關鍵點 `5`（食指根）與 `17`（小指根）在 2D 影像中重疊，單目深度 `worldLandmarks.z` 雜訊劇增。`(P5 - P0) × (P17 - P0)` 外積法向量會在連續幀內發生符號反轉（Sign Flip），導致戲偶在側面瞬間 180° 閃現成背面。
   - **濾波失效**：SLERP 與 One Euro Filter 只能平滑高頻抖動，遇到 180° 四元數反轉只會變成「戲偶不受控地慢速自轉一圈」。
2. **`setFromUnitVectors` 的零扭轉約束（Missing Twist DOF）與 180° 奇異點**
   - **反例**：`Quaternion.setFromUnitVectors(vFrom, vTo)` 只計算最短弧（Swing），完全不約束手臂軸向滾轉（Twist）。布袋戲「寬袖自然下垂」極度依賴上臂滾轉角；手指繞圈揮動時會累積軸向自轉（糖果紙扭轉效應），使寬袖翻轉朝天或鎖死腋下。此外，當手指方向與 VRM T-Pose 基準軸接近 180° 反平行（如手臂大幅橫過胸前）時，旋轉軸不唯一，四元數會瞬間爆跳。
3. **人手肌腱生理耦合（偶頭與手臂互鎖）**
   - **反例**：人類食指與中指共用伸肌腱群。當「食指＝偶頭直立」且「中指＝單側手臂大幅下壓出招」時，中指彎曲會生理性拉動食指前傾，造成**「戲偶一揮手就強制低頭鞠躬」**的體感死結。

#### B. 雙 WebGL + 隱藏 2D Canvas 錄影在 Android 端崩潰（對應關鍵問題 2）
1. **GPU 多 Context 驅逐（Context Lost）**：MediaPipe（WebGL delegate）+ Three.js（WebGL2）+ PixiJS 8（WebGL2）加上硬體視訊編碼，在行動端同時佔用 ≥3 個圖形上下文。Android 中階機極易觸發記憶體保護，直接拋出 `webglcontextlost` 導致畫面全黑（具體各機型 Context 上限與驅逐閾值屬**未確認**）。
2. **`preserveDrawingBuffer` 與跨 Canvas `drawImage` 效能懸崖**：要將兩個 WebGL Canvas 穩定 `drawImage` 進隱藏 2D Canvas，若未在同一 tick 渲染完立刻擷取，往往需開啟 `preserveDrawingBuffer: true` 才不會抓到清空的黑幀；但開啟後會破壞行動端 GPU（Adreno/Mali TBDR 架構）的雙緩衝交換最佳化，加上每幀將兩個全螢幕紋理拷貝至 2D Canvas 再餵給 `MediaRecorder`，極易造成 GPU→CPU 管線停頓（Pipeline Stall），使原本 30fps 直接掉到 12–18fps 並伴隨音畫不同步（特定 Android Chrome 版本是否完全走零拷貝 GPU 路徑屬**未確認**）。

#### C. 寬袖／長袍 SpringBone 穿透與物理炸裂（對應關鍵問題 3）
1. **快斬高角速度穿透（Tunneling）與掉幀爆裂**：`@pixiv/three-vrm` 的 SpringBone 預設採單步 Verlet 積分。布袋戲講究「急停、抖袖、快斬」，手指瞬間移動在偶身上會被放大成極高的線速度；一旦手機端同時因錄影掉幀（`deltaTime` 暴增至 >50ms），袖口質點一步就會直接跨過手臂球體碰撞器（Collider）中心，下一幀被排斥力反向彈飛，整片寬袖炸成亂抖的多邊形破片。
2. **隱藏腿骨導致下擺塌陷**：腿骨隱藏且不綁權重雖能騙過 VRM Humanoid 驗證，但少了大腿骨架帶動碰撞體，長袍下擺若掛 SpringBone 轉身時會向內捲縮成麻花；若不掛物理則像塑膠圓筒僵硬平移。

---

### 2. 隱藏維運／驗收成本（算力經濟學與單點風險）

1. **雙渲染引擎同步與共用 Context 的假命題（回應關鍵問題 2 後半）**
   - **共用 WebGL Context 並不會更穩**：強行讓 Three.js 與 PixiJS 8 共用同一個 `WebGL2RenderingContext`，兩者內部的狀態機快取（VAO、BlendMode、Stencil、ActiveTexture、Framebuffer）會互相污染。`@pixiv/three-vrm` 的 MToon 材質與 PixiJS 8 Filter（需頻繁切換 RenderTexture）混跑時，只要任一方小版本升級改動狀態重置順序（確切相容細節**未確認**），就會出現隨機閃爍或隱形破圖，除錯成本遠高於功能本身。
   - **雙 Canvas 視覺撕裂**：下層 3D 偶與上層 2D 刀光分屬兩套座標系，出招手觸發的 PixiJS 刀光若需對齊 3D 偶手中的武器尖端，每幀都必須做 3D World → NDC → 2D CSS Pixel 投影轉換，只要偶身與特效差 1 幀更新，錄影裡就會看到「刀光脫離劍尖」。
2. **AI 3D（TRELLIS）＋ VRoid 美術管線的行動端算力債**
   - VRoid 預設匯出的 VRM 頂點數、材質球（Draw Calls）與 SpringBone 骨骼鏈數量偏高；而 TRELLIS 等 AI 生成的頭冠／武器網格通常為高密度三角面且拓撲破碎、貼圖未合併。直接掛上行動端 WebGL，加上 MToon 描邊（Outline pass 雙倍頂點渲染），首幀 Shader 編譯卡頓與 3 分鐘後的手機過熱降頻（Thermal Throttling）將直接摧毀 30fps 體驗。
3. **VRM 版本分裂成本**：VRoid / Blender 外掛匯出存在 VRM 0.x 與 VRM 1.0 座標軸向（+Z vs -Z 正面）與 SpringBone 參數規格差異，手勢四元數映射在切換不同來源模型時極易出現「偶臉朝背、左右手顛倒」的驗收返工。

---

### 3. 減法建議（哪些步驟多餘、可簡化或延後）

1. **砍掉自由四元數手臂，改用「2-DOF 絞鏈約束 + 預製姿勢混合」（解問題 1）**
   - **不要用 `setFromUnitVectors` 直接驅動雙臂**：改將拇指／中指在掌心局部座標系中的位置，拆解為受限的 2 個歐拉角（例如肩關節水平揮動 Yaw `[-45°, +90°]`、抬臂 Pitch `[-30°, +80°]`），**強制鎖死手臂軸向 Twist 為固定下垂角**，徹底根除糖果紙扭轉與 180° 奇異點。
   - **側面轉身防呆**：當偵測到掌心寬度投影 `|x5 - x17| / |y9 - y0|` 低於閾值（進入側手死區）時，凍結外積算出的 Yaw 符號變化，改由手腕移動趨勢或固定最大側身角（如 `±75°` 軟上限）插值，禁止單手直接翻轉過 90°。
   - **偶頭去耦合**：食指彎曲度扣掉中指彎曲度的線性補償量（`effectiveIndex = indexFlex - k * middleFlex`），消除揮手強迫低頭。
2. **砍掉「雙 Canvas + 隱藏 2D Canvas 合成」，特效單一引擎化（解問題 2）**
   - 若進入方案 C（全身 3D），**直接淘汰 PixiJS 疊層**，將刀光（Sword Trail Mesh）、掌印（Billboard Sprite）、衝擊波搬進同一個 Three.js 場景。
   - **收益**：只剩 1 個渲染 WebGL Context，零 `drawImage` 拷貝，直接對 Three.js Canvas 呼叫 `captureStream(30)`（無需 `preserveDrawingBuffer`），且刀光天然具備 3D 深度遮擋（可繞過偶身背後，新世代布袋戲體感大增）。Phase 1 的 PixiJS 程式碼保留為獨立輕量模式即可，不必強行雙引擎縫合。
3. **寬袖與無腿下擺的「硬骨架主導 + 極簡物理」減法（解問題 3）**
   - **寬袖不做純軟布料**：袖子主體權重 70% 綁定前臂骨，僅在「袖口下緣最後 1–2 節」掛單鏈 SpringBone，並在軀幹與前臂各放 **1 個超大重疊膠囊碰撞體（Capsule Collider）**，同時在程式端將傳入 `vrm.update(Math.min(dt, 1/30))` 的時間步長強制封頂（Clamp dt），徹底杜絕掉幀炸裂。
   - **下擺改用單一「裙擺搖擺骨（Skirt Bone）」**：放棄無腿多鏈長袍物理，下身做成封閉圓錐長袍，僅設 1 根受偶身角速度反向滯後驅動的剛性擺動骨，視覺穩定且零穿模。
4. **延後 AI 3D（TRELLIS）與自製 Blender 綁骨**
   - PoC 階段全面禁止投入美術建模與 AI 配件生成；先用現成開源低面數 VRM（或極簡幾何白模）跑通操控與錄影幀率，避免操控體感不成立時美術資產全部報廢。

---

### 4. 上線前必過檢查清單（可機械驗證的條件）

#### 第一階段 PoC「手驅動 VRM 最小原型」必過 3 大生死指標（對應關鍵問題 4）
未同時通過以下 3 項前，**嚴禁啟動 VRoid/Blender 製偶與特效遷移**：
1. **【姿態穩定度指標】側手極限測試零閃現**：單手從正面慢速轉至側面 85° 來回 20 次，偶身朝向角速度峰值 `< 360°/s`，全程 **0 次** 正背面 180° 符號跳變；中指單獨快速壓放 20 次時，偶頭 Pitch 被動偏移量 `< 8°`。
2. **【行動端錄影幀率指標】Android 實機邊錄邊玩不掉幀**：在中階 Android 實機 Chrome 上，同時開啟 MediaPipe + Three.js VRM（含 SpringBone）+ `MediaRecorder` 連續錄影 60 秒，P95 Frame Time `≤ 40ms`（穩定 `≥ 25fps`），匯出影片無黑幀、無音畫脫節（偏移 `< 100ms`），且連續啟停錄影 10 次無 `webglcontextlost`。
3. **【物理防爆指標】快斬與模擬卡頓零穿模**：以最快手速連續揮動 30 秒，並以程式人工注入每 2 秒一次的 `100ms` 長幀延遲（模擬手機瞬卡），寬袖與長袍頂點穿透軀幹碰撞體或彈飛異常的次數為 **0 次**。

#### 正式上線前工程守門條件
- [ ] **時間步長硬鎖**：程式碼靜態檢查確認 `vrm.update(dt)` 的 `dt` 強制夾限於 `Math.min(rawDt, 0.033)`，防止切背景分頁切回時物理爆裂。
- [ ] **模型預算門檻**：自動化腳本檢查載入之 `.vrm` 檔案：總三角面數 `≤ 15,000`、材質球（Draw Calls）`≤ 8`、SpringBone 關節總數 `≤ 16`、碰撞體總數 `≤ 6`（含 AI 配件合併後）。
- [ ] **單一 Context 驗證**：執行期檢查 `document.querySelectorAll('canvas')` 參與即時渲染與錄影的 WebGL Context 總數（不含 MediaPipe 內部）`= 1`，且 `preserveDrawingBuffer` 為 `false`。
- [ ] **VRM 規格正規化**：載入器強制驗證並統一轉換 VRM 0.x / 1.0 正向軸，確保同一組手勢輸入在兩版模型上的四元數輸出誤差 `< 1°`。

使用的 skill：無（依單回合無工具強制限制直接推理）
