# 免費雲端部署（Render）

部署後，**任何地方的手機**只要用瀏覽器打開你的網址，就能開房／加入，不必同一 WiFi。

推薦平台：[Render](https://render.com)（免費方案支援 Node.js + WebSocket）

---

## 事前準備

1. 註冊 [GitHub](https://github.com) 帳號  
2. 註冊 [Render](https://render.com) 帳號（可用 GitHub 登入）  
3. 本專案已推送到 GitHub（見下方「上傳程式碼」）

---

## 步驟一：上傳程式碼到 GitHub

在專案資料夾 `game01` 開啟終端機：

```bash
git init
git add .
git commit -m "請以火力掩護我：可雲端部署"
```

在 GitHub 建立新 repository（例如 `gun-duel`），然後：

```bash
git remote add origin https://github.com/你的帳號/gun-duel.git
git branch -M main
git push -u origin main
```

---

## 步驟二：在 Render 建立服務

1. 登入 [Render Dashboard](https://dashboard.render.com)  
2. 點 **New +** → **Web Service**  
3. 連結你的 GitHub repo `gun-duel`  
4. 設定如下：

| 項目 | 值 |
|------|-----|
| **Name** | `gun-duel`（任意） |
| **Region** | Singapore 或離你較近的區域 |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

5. 展開 **Advanced** → **Health Check Path** 填：`/health`  
6. 點 **Create Web Service**，等待部署完成（約 2～5 分鐘）

---

## 步驟三：取得公開網址

部署成功後，頁面上方會出現類似：

```
https://gun-duel-xxxx.onrender.com
```

把這個網址傳給朋友，用手機瀏覽器開啟 → **開房** 或 **加入房間** 即可。

---

## 使用 Blueprint（可選，更快）

若 repo 裡已有 `render.yaml`：

1. **New +** → **Blueprint**  
2. 選你的 repo  
3. 確認後一鍵建立服務  

---

## 免費方案注意事項

| 項目 | 說明 |
|------|------|
| **休眠** | 約 15 分鐘無人使用會休眠，**第一次開啟要等 30～60 秒** 才會醒來 |
| **房間資料** | 存在伺服器記憶體，重啟或休眠後房間會消失，需重新開房 |
| **HTTPS** | Render 自動提供，手機可直接用，無需自己申請憑證 |

若常玩、希望不休眠，可之後升級 Render 付費方案，或改用其他平台（Railway、Fly.io 等）。

---

## 本機開發（對照）

```bash
npm install
npm start
```

本機網址：`http://localhost:3456`（僅同 WiFi 可連）

---

## 常見問題

**Q：部署後 WebSocket 連不上？**  
確認網址是 `https://`，且 Render 服務狀態為 **Live**（綠燈）。

**Q：朋友加入說找不到房間？**  
確認大家都用**同一個** `https://xxx.onrender.com` 網址，且房間代碼正確（開房後約 2 小時內有效，伺服器重啟會清空）。

**Q：還想用同 WiFi 本機玩？**  
在本機執行 `npm start`，用電腦區網 IP 即可，與雲端網址互不衝突。
