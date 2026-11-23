# puppet-vfx（布袋戲手勢偵測＋後製特效 App）

> 相機手勢辨識＋即時布袋戲風格特效濾鏡。

## 定位與路線圖
1. **Phase 1（MVP — Web App）**：瀏覽器開啟即用（手機／Mac 通用），徒手空氣操偶，使用 `@mediapipe/tasks-vision`（Hand Landmarker 21 關鍵點）＋ 規則狀態機（FSM）觸發特效＋音效＋`MediaRecorder` 錄影匯出。
2. **Phase 2（長期 — Mac 桌面版）**：Python / 原生或 Godot 4 桌面端（支援高碼率錄影、OBS 虛擬攝影機、更強的粒子／Shader／螢幕震動特效）。
3. **Phase 3（未來擴充 — 實體戲偶）**：透過 Colab L4 訓練自訂 YOLO-Pose（標註偶頭＋左右袖口＋武器尖端）＋ ByteTrack，解決手伸進戲偶衣袖內的遮擋問題。

## 目錄規劃
- `docs/MVP_SPEC.md`：Phase 1 Web App MVP 規格（招式狀態機、特效與音效清單、Colab L4 特效素材管線）
- `web/`：Phase 1 Web App 前端（預留）
- `assets/vfx/`：特效序列幀 Sprite Sheet 與音效素材（預留）
