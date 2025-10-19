---

### 📈 TrendView
Plots **serial QTc values** against **age- and sex-specific percentile bands** (50th / 90th / 99th) to visualise trends and detect outliers over time.

---

### 🧠 Architecture
| Layer | Description |
|-------|--------------|
| **Backend** | FastAPI app serving GuardRail logic and TrendView data |
| **Frontend** | Static HTML + JS for clinician input and visualisation |
| **Content** | Synthetic reference data and test cases (`age_bands.json`, `norms.json`, `percentiles.json`, `cases.json`) |

---

### ⚙️ Run locally
```bash
uvicorn backend.server:app --reload
